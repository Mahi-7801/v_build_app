const express = require('express');
const config = require('../config');

const router = express.Router();

/** Deterministic, fully answer-driven fallback used when AI is unavailable. */
function fallbackPlan(a) {
  const level = a.pushupLevel || 'beginner';
  const levelLabel = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' }[level] || 'Beginner';
  const areas = a.focusAreas?.length ? [...a.focusAreas] : ['Full Body'];
  for (const c of a.concerns || []) {
    if (!areas.includes(c)) areas.push(c);
  }
  const exercises = {
    'Full Body': ['Bodyweight Squats', 'Push-ups', 'Plank', 'Jumping Jacks', 'Glute Bridge', 'Mountain Climbers', 'Lunges'],
    Arm: ['Push-ups', 'Triceps Dips', 'Plank Shoulder Taps', 'Arm Circles', 'Bench Dips', 'Wall Push-ups'],
    Chest: ['Push-ups', 'Incline Push-ups', 'Wide Arm Push-ups', 'Chest Slaps', 'Decline Push-ups'],
    Abs: ['Crunches', 'Leg Raises', 'Plank', 'Bicycle Crunches', 'Dead Bug', 'Side Plank'],
    Leg: ['Bodyweight Squats', 'Lunges', 'Wall Sit', 'Calf Raises', 'Glute Bridge', 'Step-ups'],
    'Lower back': ['Bird Dog', 'Glute Bridge', 'Plank', 'Dead Bug', 'Side Plank', 'Cat-Cow'],
    Shoulder: ['Arm Circles', 'Plank Shoulder Taps', 'Pike Push-ups', 'Wall Push-ups', 'Shoulder Rolls'],
    Ankle: ['Calf Raises', 'Ankle Circles', 'Single-leg Balance', 'Wall Calf Stretch', 'Step-ups'],
    Wrist: ['Wrist Circles', 'Wall Push-ups', 'Plank', 'Wrist Stretch', 'Bear Crawl'],
  };
  const picks = [...new Set(areas.flatMap((x) => exercises[x] || []))].slice(0, 7);
  for (const ex of exercises['Full Body']) {
    if (picks.length >= 7) break;
    if (!picks.includes(ex)) picks.push(ex);
  }
  const sets = level === 'advanced' ? '4' : level === 'intermediate' ? '3' : '2';
  const reps = level === 'advanced' ? '15–20 reps' : level === 'intermediate' ? '10–15 reps' : '8–12 reps';
  const minutes = level === 'advanced' ? '20–30' : level === 'intermediate' ? '15–25' : '8–20';
  const days = a.weeklyDays || 3;
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const start = Math.max(0, dayNames.indexOf(a.firstDayOfWeek));
  const goalText = { lose_weight: 'fat loss', build_muscle: 'muscle gain', keep_fit: 'staying fit' }[a.goal] || 'fitness';
  const activityText = { sedentary: 'a sedentary routine', walking: 'a lightly active routine', running: 'a moderately active routine', veryActive: 'a very active routine' }[a.activityLevel] || 'your reported activity level';
  const weightKg = a.weightKg || (a.weightUnit === 'kg' ? a.weight : Math.round(a.weight / 2.20462));
  const heightCm = a.heightCm || Math.round(a.heightInches * 2.54);
  const feet = Math.floor((a.heightInches || heightCm / 2.54) / 12);
  const inches = Math.round((a.heightInches || heightCm / 2.54) % 12);

  return {
    title: `${goalText} plan for ${areas.join(' + ')}`.toUpperCase(),
    subtitle: `A ${levelLabel.toLowerCase()} plan for ${areas.join(' + ')}, ${days} days a week`,
    summary: `Built from your ${feet}'${inches}" / ${a.weight || '?'} ${a.weightUnit || ''} profile, ${levelLabel.toLowerCase()} push-up level and ${activityText}. It targets ${areas.join(', ')} with no equipment.`,
    stats: [
      { label: 'Daily Time', value: `${minutes} Min` },
      { label: 'Level', value: levelLabel },
      { label: 'Target area', value: areas.join(', ') },
      { label: 'Equipment', value: 'No Equipment' },
    ],
    exercises: picks.map((name, i) => ({
      name,
      sets,
      reps,
      note: i < (a.concerns || []).length
        ? `Move gently — protect your ${a.concerns[i]}.`
        : 'Controlled movement, steady breathing.',
    })),
    weeklySchedule: Array.from({ length: days }, (_, i) => ({
      day: dayNames[(start + i) % 7],
      focus: areas[i % areas.length],
    })),
    report: {
      assessment: `You are ${feet}'${inches}" and ${a.weight || '?'} ${a.weightUnit || ''} (${weightKg || '?'} kg / ${heightCm || '?'} cm), aiming for ${goalText} at a ${levelLabel.toLowerCase()} level with ${activityText}${a.concerns?.length ? ` and care for your ${a.concerns.join(', ')}` : ''}. This plan gives you ${days} short ${minutes}-minute sessions each week.`,
      strengths: [`Clear ${goalText} goal`, `${levelLabel} upper-body base`, `Ready to train ${days} days a week`],
      focusPoints: [...new Set([...areas, ...(a.concerns || [])])],
      recommendations: [
        `Train on ${dayNames[start % 7]} and keep ${days} sessions each week`,
        a.motivation ? `Remember your motivation: ${String(a.motivation).toLowerCase()}` : 'Warm up before every session',
        a.concerns?.length ? `Go easy on ${a.concerns.join(', ')} and stop if it hurts` : 'Rest 30–60 seconds between sets',
      ],
    },
    generatedBy: 'fallback',
  };
}

function buildPrompt(a) {
  return `You are a certified personal trainer designing a home workout plan. The user answered an onboarding questionnaire. Use EVERY answer to personalise the plan and the assessment report.

USER ANSWERS (JSON):
${JSON.stringify(a, null, 2)}

Return ONLY a JSON object with this exact structure (no markdown, no commentary):
{
  "title": "short motivating plan title in UPPERCASE",
  "subtitle": "one short line",
  "summary": "2 sentences explaining why this plan fits the user",
  "stats": [
    {"label":"Daily Time","value":"e.g. 8-23 Min"},
    {"label":"Level","value":"Beginner/Intermediate/Advanced"},
    {"label":"Target area","value":"area names"},
    {"label":"Equipment","value":"No Equipment"}
  ],
  "exercises": [
    {"name":"exercise name","sets":"3","reps":"e.g. 12 reps","note":"short coaching tip"}
  ],
  "weeklySchedule": [
    {"day":"Day 1","focus":"body area or focus"}
  ],
  "report": {
    "assessment": "3-4 sentences analysing the user's body metrics, goal, level and activity",
    "strengths": ["2-3 short points"],
    "focusPoints": ["2-4 short points"],
    "recommendations": ["3-4 short actionable points"]
  }
}

Rules:
- Provide 5-7 bodyweight exercises, no equipment.
- Match exercise intensity to push-up level and activity level.
- Use the stated weight/height and body concerns in the assessment.
- weeklySchedule must contain exactly the number of days the user chose.
- Keep all strings short enough for a mobile screen.`;
}

router.post('/plan', async (req, res) => {
  const answers = req.body || {};
  if (!config.groq.apiKey) return res.json(fallbackPlan(answers));

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.groq.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.groq.model,
        messages: [{ role: 'user', content: buildPrompt(answers) }],
        temperature: 0.35,
        max_completion_tokens: 1400,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[ai] groq error', response.status, text.slice(0, 300));
      return res.json(fallbackPlan(answers));
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    const plan = JSON.parse(content || '{}');
    if (!plan.title || !Array.isArray(plan.exercises)) return res.json(fallbackPlan(answers));
    return res.json({ ...plan, generatedBy: 'groq' });
  } catch (e) {
    console.error('[ai] generation failed:', e.message);
    return res.json(fallbackPlan(answers));
  }
});

module.exports = router;
