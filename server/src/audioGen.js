const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const db = require('./db');

const execFileAsync = promisify(execFile);

const AUDIO_DIR = path.resolve(__dirname, 'uploads', 'audio');

function ensureAudioDir() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

/** Check whether an audio_url exists and (for local /api/assets/audio files) is non-empty on disk. */
function hasAudioFile(audioUrl) {
  const raw = String(audioUrl || '').trim();
  if (!raw) return false;
  const marker = '/api/assets/audio/';
  const idx = raw.indexOf(marker);
  if (idx !== -1) {
    const file = raw.slice(idx + marker.length).split('?')[0].replace(/[^a-zA-Z0-9._-]/g, '');
    if (!file) return false;
    const full = path.join(AUDIO_DIR, file);
    try {
      return fs.existsSync(full) && fs.statSync(full).size > 512;
    } catch {
      return false;
    }
  }
  return /^https?:\/\//i.test(raw);
}

function niceSpeakName(name) {
  return String(name || 'Exercise')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b90-90\b/g, '90-90')
    .replace(/\bV-Up/gi, 'V-Up')
    .replace(/\bV-Hold/gi, 'V-Hold')
    .replace(/\bV-Crunch/gi, 'V-Crunch')
    .replace(/&/g, 'and')
    .trim();
}

function fallbackCue(name, muscle) {
  const n = String(name || '').toLowerCase();
  if (/stretch|pose|opener|cooldown|rotation/.test(n)) return 'Hold the stretch gently and breathe deeply.';
  if (/plank|hold|wall sit|v-hold/.test(n)) return 'Brace your core and keep your posture steady.';
  if (/push[- ]?up|dips|press|curl|flys|shrugs|rolls/.test(n)) return 'Keep your core tight and move with full control.';
  if (/squat|lunge|bridge|calf|kickback|hydrant|donkey|step-up/.test(n)) return 'Drive smoothly and keep your balance steady.';
  if (/crunch|sit-up|twist|v-up|flutter|scissors|bicycle|wiper|leg raise|dead bug/.test(n)) return 'Engage your abs and keep a controlled pace.';
  if (/jumping|burpee|climber|hop|skipping|high stepping|high knee|punches|toy soldiers/.test(n)) return 'Keep a strong pace and land softly.';
  if (muscle) return `Focus on your ${muscle} and maintain steady breathing.`;
  return 'Keep steady form and breathe smoothly throughout.';
}

/** Build a short, energetic coaching TTS line from exercise metadata and tips. */
function buildCoachText(ex) {
  const speakName = niceSpeakName(ex.name);
  const rawTips = typeof ex.coach_tips === 'string' ? db.parseJson(ex.coach_tips, []) : ex.coach_tips;
  const tips = Array.isArray(rawTips) ? rawTips : [];
  const parsedTips = tips
    .map((t) => ({
      type: Number(t?.type ?? 0),
      text: String(typeof t === 'string' ? t : t?.text || t?.content || t?.title || '')
        .replace(/\\n|\r|\n/g, ' ').replace(/\s+/g, ' ').trim(),
    }))
    .filter((t) => t.text.length >= 12 && t.text.length <= 95);

  const formCue = parsedTips.find((t) =>
    (t.type === 0 || t.type === 4) &&
    !/^(if you|please prepare|we suggest|it's not|you shouldn't|this is a|this can|your back)/i.test(t.text)
  ) || parsedTips.find((t) => !/^(if you|please prepare)/i.test(t.text));

  let cue = '';
  if (formCue) {
    cue = /[.!?]$/.test(formCue.text) ? formCue.text : `${formCue.text}.`;
  } else {
    const rawDesc = String(ex.description || ex.introduce || '').replace(/\\n|\r|\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (rawDesc) {
      const sentences = rawDesc.split(/(?<=[.!?])\s+/);
      const picked = sentences.find((s, idx) => idx > 0 && s.length >= 15 && s.length <= 95) || sentences[0];
      if (picked && picked.length >= 12 && picked.length <= 95) cue = picked;
    }
  }
  if (!cue) cue = fallbackCue(ex.name, ex.primary_muscle);
  return `${speakName}! ${cue}`;
}

async function wavToMp3(wavPath, mp3Path) {
  try {
    await execFileAsync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wavPath, '-ac', '1', '-ar', '24000', '-b:a', '64k', mp3Path], {
      timeout: 20_000,
    });
    if (fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 512) {
      fs.unlinkSync(wavPath);
      return true;
    }
  } catch { /* ffmpeg not on PATH or failed; caller keeps WAV */ }
  return false;
}

async function synthViaSarvam(text, basePath) {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) return null;
  const resp = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: { 'api-subscription-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      inputs: [text.slice(0, 500)],
      target_language_code: 'en-IN',
      speaker: 'aditya',
      model: 'bulbul:v3',
      pace: 1.05,
      speech_sample_rate: 24000,
      enable_preprocessing: true,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const b64 = data?.audios?.[0];
  if (!b64) return null;
  const wavPath = `${basePath}.wav`;
  const mp3Path = `${basePath}.mp3`;
  fs.writeFileSync(wavPath, Buffer.from(b64, 'base64'));
  if (await wavToMp3(wavPath, mp3Path)) return path.basename(mp3Path);
  return path.basename(wavPath);
}

async function synthViaEdgeTts(text, basePath) {
  const mp3Path = `${basePath}.mp3`;
  const bin = process.env.EDGE_TTS_BIN || 'edge-tts';
  try {
    await execFileAsync(bin, ['--voice', 'en-IN-PrabhatNeural', '--rate=+4%', '--text', text, '--write-media', mp3Path], {
      timeout: 20_000,
    });
    if (fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 512) return path.basename(mp3Path);
  } catch { /* edge-tts unavailable */ }
  return null;
}

async function synthViaWindowsSapi(text, basePath) {
  if (process.platform !== 'win32') return null;
  const wavPath = `${basePath}.wav`;
  const mp3Path = `${basePath}.mp3`;
  const psScript = [
    'Add-Type -AssemblyName System.Speech',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    '$s.Rate = 1',
    '$s.SetOutputToWaveFile($env:TTS_OUT)',
    '$s.Speak($env:TTS_TEXT)',
    '$s.Dispose()',
  ].join('; ');
  await execFileAsync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
    timeout: 20_000,
    env: { ...process.env, TTS_OUT: wavPath, TTS_TEXT: text },
  });
  if (!fs.existsSync(wavPath) || fs.statSync(wavPath).size <= 512) return null;
  if (await wavToMp3(wavPath, mp3Path)) return path.basename(mp3Path);
  return path.basename(wavPath);
}

/** Synthesize coaching audio for an exercise and return its relative /api/assets/audio URL. */
async function synthesizeExerciseAudio(ex) {
  ensureAudioDir();
  const text = buildCoachText(ex);
  const safeBase = `ex_${ex.id}_a${ex.action_id || 0}_${Date.now().toString(36)}`;
  const basePath = path.join(AUDIO_DIR, safeBase);

  const file =
    (await synthViaSarvam(text, basePath).catch(() => null)) ||
    (await synthViaEdgeTts(text, basePath).catch(() => null)) ||
    (await synthViaWindowsSapi(text, basePath).catch(() => null));

  if (!file) {
    throw new Error('No TTS synthesizer succeeded on this host');
  }
  return `/api/assets/audio/${file}`;
}

/** Scan all workout plans and exercises for missing or broken audio_url entries. */
async function scanAudioGaps() {
  const exercises = await db.query(`
    SELECT e.id, e.action_id, e.name, e.primary_muscle, e.level, e.audio_url
    FROM exercises e
    ORDER BY e.id
  `);
  const exMap = new Map();
  const missingExercises = [];
  for (const e of exercises) {
    const ready = hasAudioFile(e.audio_url);
    exMap.set(Number(e.id), { ...e, audioReady: ready });
    if (!ready) {
      missingExercises.push({
        id: Number(e.id),
        action_id: Number(e.action_id),
        name: e.name,
        primary_muscle: e.primary_muscle,
        level: Number(e.level || 1),
      });
    }
  }

  const plans = await db.query(`
    SELECT id, code, name, category, level, total_exercises
    FROM workout_plans
    ORDER BY sort_order, id
  `);
  const planItems = await db.query(`
    SELECT plan_id, exercise_id
    FROM workout_plan_items
  `);

  const byPlan = new Map();
  for (const p of plans) {
    byPlan.set(Number(p.id), {
      id: Number(p.id),
      code: p.code,
      name: p.name,
      category: p.category,
      level: Number(p.level || 1),
      totalItems: 0,
      exerciseIds: new Set(),
    });
  }
  for (const it of planItems) {
    const entry = byPlan.get(Number(it.plan_id));
    if (!entry) continue;
    entry.totalItems++;
    if (it.exercise_id) entry.exerciseIds.add(Number(it.exercise_id));
  }

  const planReports = [];
  let readyPlans = 0;
  let plansWithGaps = 0;
  for (const p of byPlan.values()) {
    const missingIds = [];
    const missingNames = [];
    let readyDistinct = 0;
    for (const eid of p.exerciseIds) {
      const ex = exMap.get(eid);
      if (ex?.audioReady) readyDistinct++;
      else {
        missingIds.push(eid);
        if (ex?.name) missingNames.push(ex.name);
      }
    }
    const hasGap = p.totalItems === 0 || missingIds.length > 0;
    if (hasGap) plansWithGaps++;
    else readyPlans++;

    planReports.push({
      id: p.id,
      code: p.code,
      name: p.name,
      category: p.category,
      level: p.level,
      totalItems: p.totalItems,
      distinctExercises: p.exerciseIds.size,
      readyExercises: readyDistinct,
      missingCount: missingIds.length,
      missingExerciseIds: missingIds,
      missingExerciseNames: missingNames.slice(0, 8),
    });
  }

  return {
    summary: {
      totalPlans: plans.length,
      readyPlans,
      plansWithGaps,
      totalExercises: exercises.length,
      exercisesWithAudio: exercises.length - missingExercises.length,
      exercisesMissingAudio: missingExercises.length,
    },
    missingExercises,
    plans: planReports.filter((p) => p.missingCount > 0 || p.totalItems === 0),
    allPlans: planReports,
  };
}

/** Generate and apply coaching audio for exercises with missing audio (or targeted IDs / planId). */
async function fillAudioGaps({ planId, exerciseIds, overwrite = false } = {}) {
  let targetIds = null;
  if (Array.isArray(exerciseIds) && exerciseIds.length) {
    targetIds = [...new Set(exerciseIds.map(Number).filter(Boolean))];
  } else if (planId) {
    const rows = await db.query(
      'SELECT DISTINCT exercise_id FROM workout_plan_items WHERE plan_id = ? AND exercise_id IS NOT NULL',
      [Number(planId)]
    );
    targetIds = rows.map((r) => Number(r.exercise_id)).filter(Boolean);
  }

  const all = await db.query(`
    SELECT e.id, e.action_id, e.name, e.introduce, e.primary_muscle, e.audio_url,
           t.description, t.coach_tips
    FROM exercises e
    LEFT JOIN exercise_texts t ON t.exercise_id = e.id AND t.lang = 'en'
    ${targetIds ? `WHERE e.id IN (${targetIds.map(() => '?').join(',')})` : ''}
    ORDER BY e.id
  `, targetIds || []);

  const targets = overwrite ? all : all.filter((e) => !hasAudioFile(e.audio_url));
  const generated = [];
  const failed = [];

  for (const ex of targets) {
    try {
      const audioUrl = await synthesizeExerciseAudio(ex);
      await db.query('UPDATE exercises SET audio_url = ? WHERE id = ?', [audioUrl, ex.id]);
      generated.push({ id: Number(ex.id), name: ex.name, audioUrl });
    } catch (err) {
      failed.push({ id: Number(ex.id), name: ex.name, error: err.message });
    }
  }

  const report = await scanAudioGaps();
  return {
    checked: all.length,
    skipped: all.length - targets.length,
    generatedCount: generated.length,
    failedCount: failed.length,
    generated,
    failed,
    summary: report.summary,
  };
}

module.exports = {
  AUDIO_DIR,
  hasAudioFile,
  buildCoachText,
  synthesizeExerciseAudio,
  scanAudioGaps,
  fillAudioGaps,
};
