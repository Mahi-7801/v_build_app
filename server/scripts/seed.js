/* eslint-disable no-console */
/**
 * Seed the MySQL database from the REA/JADX/Ghidra analysis output.
 *
 * Sources
 *   analysis/decoded_assets.json  - 158 lpcore-XOR decrypted APK assets
 *                                   (plans, muscle taxonomy, explore config,
 *                                    19 language UI string files)
 *   analysis/explore_catalog.json - derived explore/home-screen catalogue
 *   analysis/app_strings.json     - 19 languages x 128 UI strings
 *   analysis/decoded_enc_assets.json (optional) - the 5d8b5208 family, if the
 *                                   second cipher has been cracked; supplies the
 *                                   real exercise names / tips / quotes.
 */
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const config = require("../src/config");

const ANALYSIS = path.resolve(__dirname, "..", "..", "analysis");
const DECODED = path.join(ANALYSIS, "decoded_assets.json");
const CATALOG = path.join(ANALYSIS, "explore_catalog.json");
const STRINGS = path.join(ANALYSIS, "app_strings.json");
const ENC = path.join(ANALYSIS, "decoded_enc_assets.json");

const readJson = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);

const decoded = readJson(DECODED);
if (!decoded) {
  console.error(`[seed] missing ${DECODED} - run: node analysis/decode_all_assets.js`);
  process.exit(1);
}
const catalog = readJson(CATALOG);
const appStrings = readJson(STRINGS);
const enc = readJson(ENC) || {};

// Build a fast index of the decrypted exercise assets:
//   actionId -> { attrs: <parsed attrs JSON>, texts: { en: <parsed text JSON>, ... } }
const encByAction = new Map();
for (const [rel, v] of Object.entries(enc)) {
  let m = /^workout\/actions\/(\d+)\/attrs\/\d+\/data\/data$/.exec(rel);
  let obj;
  try { obj = JSON.parse(v.data); } catch { continue; }
  if (m) {
    const id = Number(m[1]);
    if (!encByAction.has(id)) encByAction.set(id, { attrs: obj, texts: {} });
    encByAction.get(id).attrs = obj;
    continue;
  }
  m = /^workout\/actions\/(\d+)\/text\/\d+\/data\/([^/]+)$/.exec(rel);
  if (m) {
    const id = Number(m[1]);
    if (!encByAction.has(id)) encByAction.set(id, { attrs: null, texts: {} });
    encByAction.get(id).texts[m[2]] = obj;
  }
}

const LEVEL_WORDS = { 1: "Beginner", 2: "Intermediate", 3: "Advanced" };

/* ------------------------------------------------------------------ *
 * Plan metadata: derive category / level / display name from the
 * asset code, e.g. "d_ab_1", "7__4_beginner", "u/d_12", "pro/...".
 * ------------------------------------------------------------------ */
function planMeta(code) {
  // strip the folder prefixes for classification only; the stored code keeps them
  const file = code.replace(/^workout\//, "").replace(/^daily\//, "").replace(/^pro\//, "");
  let category = "other";
  let level = 1;
  let name = file;
  let isPro = false;
  let rounds = 1;

  const dayMatch = /(?:^|\/)(?:l0\/u\/|l1\/u\/|u\/|l\/|l0\/|l1\/)?d_(\d+)$/.exec(file);
  const upperLower = /^(l0\/u\/|l1\/u\/|u\/|l\/|l0\/|l1\/)(d_\d+)$/.exec(file);
  const bodyPart = /^d_(ab|ar|ch|le|sh)_(\d)$/.exec(file);
  const seven = /^7__4_(beginner|intermediate|advance)$/.exec(file);
  const upper = /^upper_(\d)$/.exec(file);
  const lower = /^lower(_new)?$/.exec(file);
  const broad = /^broad_shoulde_lev(\d)$/.exec(file);
  const diff = /^diff\/(\d+)$/.exec(file);

  const PART_LABEL = { ab: "Abs", ar: "Arms", ch: "Chest", le: "Legs", sh: "Shoulders" };
  const PART_CAT = { ab: "abs", ar: "arms", ch: "chest", le: "legs", sh: "shoulder" };

  if (bodyPart) {
    category = PART_CAT[bodyPart[1]];
    level = Number(bodyPart[2]);
    name = `${PART_LABEL[bodyPart[1]]} - ${LEVEL_WORDS[level]}`;
  } else if (seven) {
    category = "hiit";
    level = seven[1] === "beginner" ? 1 : seven[1] === "intermediate" ? 2 : 3;
    name = `7 Minute 4 Moves - ${LEVEL_WORDS[level]}`;
  } else if (upper) {
    category = "full_body";
    level = Number(upper[1]);
    name = `Upper Body - ${LEVEL_WORDS[level]}`;
  } else if (lower) {
    category = "legs";
    name = lower[1] ? "Lower Body (New)" : "Lower Body";
  } else if (broad) {
    category = "shoulder";
    level = Number(broad[1]);
    isPro = true;
    name = `Broad Shoulders - ${LEVEL_WORDS[level]}`;
  } else if (diff) {
    category = "hiit";
    name = `Difficulty Variant ${diff[1]}`;
  } else if (upperLower) {
    const group = upperLower[1];
    const day = Number(upperLower[2].slice(2));
    category = group.includes("l") && !group.includes("u") ? "legs" : "full_body";
    const prefix =
      group === "l0/u/" ? "Upper Body (Easy)" :
      group === "l1/u/" ? "Upper Body (Normal)" :
      group === "u/" ? "Upper Body" :
      group === "l/" ? "Lower Body" :
      group === "l0/" ? "Lower Body (Easy)" : "Lower Body (Normal)";
    name = `${prefix} - Day ${day}`;
  } else if (dayMatch) {
    category = "full_body";
    name = `Workout Day ${dayMatch[1]}`;
  }

  if (file.startsWith("u/") || file.startsWith("l/") || file.includes("/u/")) rounds = 28;
  return { category, level, name, isPro, rounds };
}

/* ------------------------------------------------------------------ *
 * Normalise the two plan JSON shapes found in the APK:
 *   A) [{"name":"1","exercise":[{"actionId":15,"time":20,"rest":10}]}]
 *   B) {"actions":[{"id":15,"time":20}]}
 * ------------------------------------------------------------------ */
function normalizePlan(parsed) {
  const days = [];
  if (Array.isArray(parsed)) {
    for (const d of parsed) {
      days.push({
        name: String(d.name ?? days.length + 1),
        exercises: (d.exercise || d.exercises || []).map((e) => ({
          actionId: Number(e.actionId ?? e.actionid ?? e.id),
          time: Number(e.time ?? e.duration ?? 30),
          rest: Number(e.rest ?? 15),
          unit: e.unit || "s",
          actype: e.actype ?? 0,
          rounds: e.rounds ?? 1,
        })),
      });
    }
  } else if (parsed && Array.isArray(parsed.actions)) {
    days.push({
      name: "1",
      exercises: parsed.actions.map((e) => ({
        actionId: Number(e.id ?? e.actionId),
        time: Number(e.time ?? 30),
        rest: Number(e.rest ?? 15),
        unit: e.unit || "s",
        actype: e.actype ?? 0,
        rounds: e.rounds ?? 1,
      })),
    });
  }
  return days;
}

/* ------------------------------------------------------------------ *
 * Exercise catalogue
 * ------------------------------------------------------------------ */
function collectExercises() {
  const ids = new Set();
  const plans = [];

  for (const [rel, v] of Object.entries(decoded)) {
    if (!/^(workout\/file\/|workout\/diff\/|pro\/|u\/|l\/|l0\/|l1\/|d_[a-z]{2}_\d$|upper_\d$|lower)/.test(rel)) continue;
    let parsed;
    try { parsed = JSON.parse(v.data); } catch { continue; }
    const days = normalizePlan(parsed);
    if (!days.length) continue;
    // Assets live at several roots; keep the codes unique:
    //   workout/file/<x>  -> "<x>"          (full day plans)
    //   workout/diff/<n>  -> "diff/<n>"     (difficulty variants)
    //   u|l|l0|l1|pro/... -> "<same>"       (grouped plans)
    //   <root>/<x>        -> "daily/<x>"    (legacy flat action lists)
    let code;
    if (rel.startsWith("workout/file/")) code = rel.slice("workout/file/".length);
    else if (rel.startsWith("workout/diff/")) code = "diff/" + rel.slice("workout/diff/".length);
    else if (/^(u|l|l0|l1|pro)\//.test(rel)) code = rel;
    else code = "daily/" + rel;
    plans.push({ code, days, meta: planMeta(code) });
    for (const d of days) for (const e of d.exercises) ids.add(e.actionId);
  }

  // exercise attributes/text live in the 5d8b5208 family
  for (const rel of Object.keys(enc)) {
    const m = /^workout\/actions\/(\d+)\//.exec(rel);
    if (m) ids.add(Number(m[1]));
  }

  return { ids: [...ids].sort((a, b) => a - b), plans };
}

function exerciseName(actionId) {
  const en = encByAction.get(actionId)?.texts?.en;
  const t = en && (en.name || en.title || en.text);
  return t ? String(t) : `Exercise ${actionId}`;
}

function exerciseIntro(actionId) {
  const en = encByAction.get(actionId)?.texts?.en;
  const d = en && (en.introduce || en.description || en.content);
  return d ? String(d) : null;
}

const MUSCLE_NAMES = {
  1: 'abs', 2: 'back', 3: 'triceps', 4: 'biceps', 5: 'forearms',
  6: 'chest', 7: 'shoulders', 8: 'glutes', 9: 'quadriceps',
  10: 'hamstrings', 11: 'calves', 12: 'traps', 13: 'lower back',
  14: 'full body', 15: 'adductors', 16: 'obliques', 17: 'neck',
};

function exerciseMuscles(actionId) {
  const cf = encByAction.get(actionId)?.attrs?.customfields || {};
  const major = (cf.muscle_major || []).map((x) => MUSCLE_NAMES[Number(x)]).filter(Boolean);
  const minor = (cf.muscle_minor || []).map((x) => MUSCLE_NAMES[Number(x)]).filter(Boolean);
  return { major: major[0] || null, minor };
}

/* ------------------------------------------------------------------ *
 * Explore workout -> plan code resolution
 * ------------------------------------------------------------------ */
const PART_PLAN = {
  0: (l) => `d_ab_${l}`,
  1: (l) => `d_le_${l}`,
  2: (l) => `d_le_${l}`,
  3: (l) => `d_ch_${l}`,
  4: (l) => `d_ar_${l}`,
  16: (l) => `d_sh_${l}`,
  7: (l) => (l === 1 ? "7__4_beginner" : l === 2 ? "7__4_intermediate" : "7__4_advance"),
};

function resolvePlanCode(w, availableCodes) {
  if (!w.name_key) {
    // difficulty variants: workout/diff/<id>
    const c = `diff/${w.id}`;
    return availableCodes.has(c) ? c : null;
  }
  if (w.part_id != null && PART_PLAN[w.part_id] && w.level) {
    const c = PART_PLAN[w.part_id](w.level);
    if (availableCodes.has(c)) return c;
  }
  return null;
}

/* ------------------------------------------------------------------ */
async function main() {
  const { ids, plans } = collectExercises();
  console.log(`[seed] ${plans.length} plans, ${ids.length} exercises`);
  const availableCodes = new Set(plans.map((p) => p.code));

  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: false,
  });

  const order = [
    "explore_module_items", "explore_modules", "explore_lists", "explore_workouts",
    "app_strings", "muscles", "exercise_texts", "exercise_tips", "user_exercise_stats",
    "workout_session_exercises", "workout_sessions", "user_plans", "workout_plan_items",
    "workout_plan_days", "workout_plans", "exercises", "quotes", "achievements",
    "user_achievements", "subscriptions", "health_records", "reminders",
    "user_settings", "users",
  ];
  console.log("[seed] clearing existing content ...");
  await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const t of order) await conn.query(`TRUNCATE TABLE \`${t}\``);
  await conn.query("SET FOREIGN_KEY_CHECKS = 1");

  /* ---------------- muscles ---------------- */
  for (const scope of ["major", "minor"]) {
    const key = `workout/muscle_${scope}`;
    if (!decoded[key]) continue;
    const rows = JSON.parse(decoded[key].data);
    for (const m of rows) {
      await conn.execute(
        "INSERT IGNORE INTO muscles (item_value, name_key, scope, sort_order) VALUES (?, ?, ?, ?)",
        [m.itemvalue, m.namekey, scope, m.itemid]
      );
    }
  }
  console.log("[seed] muscles inserted");

  /* ---------------- exercises ---------------- */
  const exerciseIdByAction = new Map();
  let sort = 0;
  for (const actionId of ids) {
    const slug = `exercise-${actionId}`;
    const name = exerciseName(actionId);
    const introduce = exerciseIntro(actionId);
    const attrs = encByAction.get(actionId)?.attrs || {};
    const muscles = exerciseMuscles(actionId);
    const lottie = `workout/actions/${actionId}/lottie/men_white/1/data/data`;
    const unit = attrs.unit === 's' || !attrs.unit ? 's' : 'reps';
    const [r] = await conn.execute(
      `INSERT INTO exercises
         (action_id, slug, name, introduce, unit, image_path, lottie_path, video_url,
          alternation, primary_muscle, secondary_muscles, equipment, level,
          calories_per_unit, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', ?, ?, ?)`,
      [actionId, slug, name, introduce, unit, `workout/actions/${actionId}`, lottie,
       attrs.videoUrl || null, attrs.alternation ? 1 : 0, muscles.major,
       JSON.stringify(muscles.minor), Number(attrs.levelid || 1) || 1,
       Number(attrs.kaluli || 0) || 0, sort++]
    );
    exerciseIdByAction.set(actionId, r.insertId);
  }
  console.log(`[seed] ${exerciseIdByAction.size} exercises inserted`);

  /* ---------------- exercise texts (from the 5d8b5208 family) -------- */
  let textCount = 0;
  for (const [rel, v] of Object.entries(enc)) {
    const m = /^workout\/actions\/(\d+)\/text\/[^/]+\/data\/([^/]+)$/.exec(rel);
    if (!m) continue;
    const exId = exerciseIdByAction.get(Number(m[1]));
    if (!exId) continue;
    let obj;
    try { obj = JSON.parse(v.data); } catch { continue; }
    const title = obj.title || obj.name || obj.text || `Exercise ${m[1]}`;
    const description = obj.description || obj.introduce || obj.content || null;
    const steps = obj.steps || obj.list || null;
    const coachTips = obj.coachTips || obj.tips || null;
    await conn.execute(
      `INSERT INTO exercise_texts (exercise_id, lang, title, description, steps, coach_tips)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE title=VALUES(title), description=VALUES(description),
         steps=VALUES(steps), coach_tips=VALUES(coach_tips)`,
      [exId, m[2], String(title), description ? String(description) : null,
       steps ? JSON.stringify(steps) : null, coachTips ? JSON.stringify(coachTips) : null]
    );
    textCount++;
  }
  console.log(`[seed] ${textCount} exercise translations inserted`);

  /* ---------------- workout plans ---------------- */
  let planCount = 0;
  let itemCount = 0;
  for (const p of plans) {
    const totalExercises = p.days.reduce((a, d) => a + d.exercises.length, 0);
    const duration = p.days.reduce(
      (a, d) => a + d.exercises.reduce((b, e) => b + e.time + e.rest, 0),
      0
    );
    const [pr] = await conn.execute(
      `INSERT INTO workout_plans
         (code, name, description, category, level, duration_sec, total_exercises, rounds, is_pro, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.code, p.meta.name, null, p.meta.category, p.meta.level, duration, totalExercises,
       p.meta.rounds, p.meta.isPro ? 1 : 0, planCount]
    );
    const planId = pr.insertId;
    let seq = 0;
    for (let di = 0; di < p.days.length; di++) {
      const day = p.days[di];
      const [dr] = await conn.execute(
        "INSERT INTO workout_plan_days (plan_id, day_index, name) VALUES (?, ?, ?)",
        [planId, di + 1, day.name]
      );
      const dayId = dr.insertId;
      for (const e of day.exercises) {
        const exId = exerciseIdByAction.get(e.actionId) || null;
        await conn.execute(
          `INSERT INTO workout_plan_items
             (plan_id, day_id, sequence, action_id, exercise_id, time_sec, rest_sec, rounds)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [planId, dayId, seq++, e.actionId, exId, e.time, e.rest, e.rounds || 1]
        );
        itemCount++;
      }
    }
    planCount++;
  }
  console.log(`[seed] ${planCount} plans / ${itemCount} plan items inserted`);

  /* ---------------- explore catalogue ---------------- */
  const nz = (v) => (v === undefined ? null : v);
  if (catalog) {
    for (const w of catalog.workouts) {
      await conn.execute(
        `INSERT INTO explore_workouts
           (id, name_key, description_key, duration_sec, minutes, muscles, icon, icon_bg, cover,
            part_id, category_id, gender, lock_state, level_key, level, workoutlist_ids,
            recommended_ids, plan_code, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [w.id, w.name_key || "", nz(w.description_key), w.duration_sec, w.minutes,
         JSON.stringify(w.muscles || []), nz(w.icon),
         w.icon_bg ? JSON.stringify(w.icon_bg) : null, nz(w.cover),
         nz(w.part_id), nz(w.category_id), nz(w.gender), nz(w.lock_state),
         nz(w.level_key), nz(w.level),
         JSON.stringify(w.workoutlist_ids || []), JSON.stringify(w.recommended_ids || []),
         nz(resolvePlanCode(w, availableCodes)), w.id]
      );
    }
    for (const l of catalog.lists) {
      await conn.execute(
        `INSERT INTO explore_lists (id, name_key, description_key, cover, icon, workout_ids)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [l.id, l.name_key || "", nz(l.description_key), nz(l.cover), nz(l.icon),
         JSON.stringify(l.workout_ids || [])]
      );
    }
    const listKeys = new Set(catalog.lists.map((l) => l.name_key));
    for (const m of catalog.modules) {
      await conn.execute(
        "INSERT INTO explore_modules (id, name_key, description_key, sort_order) VALUES (?, ?, ?, ?)",
        [m.id, m.name_key || "", nz(m.description_key), m.id]
      );
      let i = 0;
      for (const c of m.children) {
        await conn.execute(
          `INSERT INTO explore_module_items (module_id, workout_id, name_key, icon, sort_order)
           VALUES (?, ?, ?, ?, ?)`,
          [m.id, c.workout_id, nz(c.name_key), nz(c.icon), i++]
        );
      }
    }
    console.log(`[seed] explore catalogue: ${catalog.workouts.length} workouts, ` +
      `${catalog.lists.length} lists, ${catalog.modules.length} modules`);
  }

  /* ---------------- localized UI strings ---------------- */
  if (appStrings) {
    let n = 0;
    for (const [lang, map] of Object.entries(appStrings)) {
      for (const [k, v] of Object.entries(map)) {
        await conn.execute(
          "INSERT INTO app_strings (lang, str_key, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value=VALUES(value)",
          [lang, k, typeof v === "string" ? v : JSON.stringify(v)]
        );
        n++;
      }
    }
    console.log(`[seed] ${n} localized strings inserted`);
  }

  /* ---------------- exercise tips (mistakeTips / breathTips) ------------- */
  let tipCount = 0;
  for (const [rel, v] of Object.entries(enc)) {
    const m = /^json\/exercise_ext_info_([^/]+)$/.exec(rel);
    if (!m) continue;
    let arr;
    try { arr = JSON.parse(v.data); } catch { continue; }
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const exId = exerciseIdByAction.get(Number(item.actId)) || null;
      for (const [field, type] of [['mistakeTips', 'mistake'], ['breathTips', 'breath']]) {
        const content = item[field];
        if (!content) continue;
        const title = type === 'mistake' ? 'Common mistakes' : 'Breathing';
        await conn.execute(
          `INSERT INTO exercise_tips (exercise_id, lang, tip_type, title, content, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [exId, m[1], type, title, String(content), tipCount++]
        );
      }
    }
  }
  console.log(`[seed] ${tipCount} exercise tips inserted`);

  /* ---------------- enc_tip motivational strings ------------------------- */
  let encTipCount = 0;
  for (const [rel, v] of Object.entries(enc)) {
    const m = /^enc_tip\/([^/]+)$/.exec(rel);
    if (!m) continue;
    let obj;
    try { obj = JSON.parse(v.data); } catch { continue; }
    for (const [key, val] of Object.entries(obj)) {
      const value = Array.isArray(val) ? val.join('\n') : String(val);
      await conn.execute(
        `INSERT INTO app_strings (lang, str_key, value) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [m[1], `enc_tip.${key}`, value]
      );
      encTipCount++;
    }
  }
  console.log(`[seed] ${encTipCount} in-app tip strings inserted`);

  /* ---------------- quotes ---------------- */
  let quoteCount = 0;
  if (enc["json/quotes"]) {
    try {
      const q = JSON.parse(enc["json/quotes"].data);
      const arr = Array.isArray(q) ? q : q.quotes || Object.values(q);
      for (const item of arr) {
        const text = typeof item === "string" ? item : item.text || item.content;
        if (!text) continue;
        await conn.execute(
          "INSERT INTO quotes (text, author, lang) VALUES (?, ?, ?)",
          [String(text), item.author || null, "en"]
        );
        quoteCount++;
      }
    } catch { /* fall through to defaults */ }
  }
  if (!quoteCount) {
    const defaults = [
      ["The secret of getting ahead is getting started.", "Mark Twain"],
      ["It always seems impossible until it's done.", "Nelson Mandela"],
      ["Don't stop when you're tired. Stop when you're done.", "David Goggins"],
      ["A little progress each day adds up to big results.", "Satya Nani"],
      ["The body achieves what the mind believes.", "Joseph Pilates"],
      ["Discipline equals freedom.", "Jocko Willink"],
      ["You don't have to be great to start, but you have to start to be great.", "Zig Ziglar"],
      ["Sweat now, shine later.", "Unknown"],
      ["Well done is better than well said.", "Benjamin Franklin"],
      ["Take care of your body. It's the only place you have to live.", "Jim Rohn"],
    ];
    for (const [text, author] of defaults) {
      await conn.execute("INSERT INTO quotes (text, author, lang) VALUES (?, ?, 'en')", [text, author]);
      quoteCount++;
    }
  }
  console.log(`[seed] ${quoteCount} quotes inserted`);

  /* ---------------- achievements ---------------- */
  const achievements = [
    ["first_workout", "First workout", "Complete your first workout", "sessions", 1],
    ["workouts_10", "Getting started", "Complete 10 workouts", "sessions", 10],
    ["workouts_50", "Workout warrior", "Complete 50 workouts", "sessions", 50],
    ["workouts_100", "Century club", "Complete 100 workouts", "sessions", 100],
    ["minutes_60", "One hour", "Train for 60 minutes", "minutes", 60],
    ["minutes_600", "10 hours of sweat", "Train for 600 minutes", "minutes", 600],
    ["calories_1000", "Calorie crusher", "Burn 1,000 calories", "calories", 1000],
    ["calories_10000", "Fat burner", "Burn 10,000 calories", "calories", 10000],
    ["exercises_20", "Explorer", "Try 20 different exercises", "exercises", 20],
    ["exercises_60", "All round", "Try 60 different exercises", "exercises", 60],
    ["streak_7", "One week streak", "Work out 7 days in a row", "streak", 7],
    ["streak_30", "Month of discipline", "Work out 30 days in a row", "streak", 30],
  ];
  for (const [code, title, desc, metric, threshold] of achievements) {
    await conn.execute(
      "INSERT INTO achievements (code, title, description, metric, threshold) VALUES (?, ?, ?, ?, ?)",
      [code, title, desc, metric, threshold]
    );
  }
  console.log(`[seed] ${achievements.length} achievements inserted`);

  /* ---------------- demo user ---------------- */
  const hash = await bcrypt.hash("workout123", 12);
  const [ur] = await conn.execute(
    `INSERT INTO users (email, password_hash, display_name, auth_provider, is_pro)
     VALUES ('demo@homeworkout.app', ?, 'Demo User', 'local', 1)`,
    [hash]
  );
  await conn.execute(
    `INSERT INTO user_settings (user_id, weight_kg, height_cm, age, gender, goal_type,
       difficulty, units, language, theme, onboarding_complete)
     VALUES (?, 70.00, 175, 30, 'male', 'stay_fit', 1, 'metric', 'en', 'light', 1)`,
    [ur.insertId]
  );
  console.log("[seed] demo user created (demo@homeworkout.app / workout123)");

  await conn.end();
  console.log("[seed] done");
}

main().catch((e) => {
  console.error("[seed] error:", e);
  process.exit(1);
});
