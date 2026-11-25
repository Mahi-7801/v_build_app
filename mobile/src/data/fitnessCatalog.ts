/**
 * Sample catalog for the additional Home/Discover/Report/Settings sections.
 * Kept local so every new section renders with realistic data even when the
 * API is unreachable (Expo Go on a different Wi-Fi, offline, etc.).
 */

export type SampleWorkout = {
  name: string;
  meta: string;
  tag?: string;
};

const w = (name: string, meta: string, tag?: string): SampleWorkout => ({ name, meta, tag });

/* ------------------------------- Challenge ------------------------------ */
export const CHALLENGE_TABS = ['All', 'Build Muscle', 'Lose Weight'] as const;
export const CHALLENGE_FILTERS = [
  'Full Body', 'Abs', 'Upper Body', 'Lower Body', 'Height Increase',
  'Calisthenics', 'Kegel', 'Dumbbell',
] as const;

export const CHALLENGES: Array<{
  tab: string; filter: string; category: string; duration: string; title: string;
}> = [
  { tab: 'Lose Weight', filter: 'Full Body', category: 'Lose Weight', duration: '30 Days', title: 'LOSE WEIGHT FOR MEN' },
  { tab: 'Lose Weight', filter: 'Abs', category: 'Lose Weight', duration: '21 Days', title: 'FLAT BELLY CHALLENGE' },
  { tab: 'Build Muscle', filter: 'Upper Body', category: 'Build Muscle', duration: '30 Days', title: 'BIGGER CHEST & ARMS' },
  { tab: 'Build Muscle', filter: 'Dumbbell', category: 'Build Muscle', duration: '45 Days', title: 'DUMBBELL MASS BUILDER' },
  { tab: 'Build Muscle', filter: 'Lower Body', category: 'Build Muscle', duration: '30 Days', title: 'POWERFUL LEGS' },
  { tab: 'All', filter: 'Height Increase', category: 'Height Increase', duration: '60 Days', title: 'GROW TALLER FOUNDATION' },
  { tab: 'All', filter: 'Calisthenics', category: 'Calisthenics', duration: '30 Days', title: 'BODYWEIGHT MASTERY' },
  { tab: 'All', filter: 'Kegel', category: 'Kegel', duration: '21 Days', title: 'CORE & PELVIC STRENGTH' },
  { tab: 'All', filter: 'Full Body', category: 'Full Body', duration: '7 Days', title: '7-DAY FULL BODY RESET' },
];

/* ------------------------------ Body Focus ------------------------------ */
export const BODY_FOCUS_AREAS = ['Abs', 'Arm', 'Forearm', 'Chest', 'Leg', 'Butt', 'Shoulder & Back'] as const;

const LEVEL_WORKOUTS = (area: string, mins: [number, number, number], counts: [number, number, number]): SampleWorkout[] => [
  w(`${area} Beginner`, `${mins[0]} mins · ${counts[0]} Exercises`, 'Beginner'),
  w(`${area} Intermediate`, `${mins[1]} mins · ${counts[1]} Exercises`, 'Intermediate'),
  w(`${area} Advanced`, `${mins[2]} mins · ${counts[2]} Exercises`, 'Advanced'),
];

export const BODY_FOCUS_WORKOUTS: Record<string, SampleWorkout[]> = {
  Abs: LEVEL_WORKOUTS('Abs', [12, 18, 24], [15, 22, 30]),
  Arm: LEVEL_WORKOUTS('Arm', [18, 25, 31], [19, 25, 28]),
  Forearm: LEVEL_WORKOUTS('Forearm', [10, 15, 20], [12, 18, 24]),
  Chest: LEVEL_WORKOUTS('Chest', [14, 22, 29], [16, 24, 30]),
  Leg: LEVEL_WORKOUTS('Leg', [20, 28, 35], [21, 27, 32]),
  Butt: LEVEL_WORKOUTS('Butt', [16, 23, 30], [18, 25, 29]),
  'Shoulder & Back': LEVEL_WORKOUTS('Shoulder & Back', [19, 26, 33], [20, 26, 31]),
};

/* ----------------------------- Quick actions ---------------------------- */
export const QUICK_ACTIONS = [
  'Warm-up', 'Burn Fat', 'Keep Fit', 'Stretch', '>15 mins',
  'Intermediate', 'Build Muscle', 'Advanced', 'With equipment',
] as const;

/* --------------------------- Workout collections ------------------------ */
export const RECOMMENDED: SampleWorkout[] = [
  w('Height Increase', '12 min · Beginner', 'Height'),
  w('Height Starter', '10 min · Beginner', 'Height'),
  w('Grow Taller Foundation', '15 min · Beginner', 'Height'),
  w('360 Height Boost', '18 min · Intermediate', 'Height'),
  w('Explosive Height Gains', '22 min · Advanced', 'Height'),
  w('Extreme Height Growth', '26 min · Advanced', 'Height'),
  w('Maximum Height Growth', '30 min · Advanced', 'Height'),
];

export const JUST_FOR_YOU: SampleWorkout[] = [
  w('Intense Leg Transformation', '24 min · 28 Exercises', 'Legs'),
  w('Bigger Arm Challenge', '21 min · 25 Exercises', 'Arms'),
  w('Easy Arm Workout with Dumbbells', '16 min · 18 Exercises', 'Dumbbell'),
  w('Bigger Strong Quads Leg Workout', '25 min · 26 Exercises', 'Legs'),
  w('Killer Core HIIT Advanced', '20 min · 24 Exercises', 'HIIT'),
  w('Dumbbells Abs Shaper', '14 min · 20 Exercises', 'Abs'),
];

export const STRETCH_WORKOUTS: SampleWorkout[] = [
  w('Upper Body Stretching', '10 min · Recovery'),
  w('Full Body Stretching', '14 min · Recovery'),
  w('Morning Warm-up', '7 min · Warm-up'),
  w('Night Relax Stretch', '12 min · Recovery'),
  w('Hip Opener Flow', '9 min · Mobility'),
  w('Post Workout Cooldown', '8 min · Recovery'),
];

export const POPULAR_GOALS = [
  { title: 'Build Muscle', sub: 'Strength & size plans', icon: 'dumbbell' as const, tint: '#E8F0FF' },
  { title: 'Burn Fat', sub: 'Cardio & HIIT plans', icon: 'flame' as const, tint: '#FFEDE4' },
  { title: 'Keep Fit', sub: 'Daily movement plans', icon: 'heartPulse' as const, tint: '#E6F7F0' },
];

/* ------------------------------- Discover ------------------------------- */
export const DISCOVER_SECTIONS: Array<{ title: string; subtitle: string; items: SampleWorkout[] }> = [
  {
    title: 'Picks for you', subtitle: 'Based on your goals',
    items: [
      w('Intense Leg Transformation', '24 min · 28 Exercises'),
      w('Bigger Arm Challenge', '21 min · 25 Exercises'),
      w('Killer Core HIIT Advanced', '20 min · 24 Exercises'),
      w('Full Body Reset', '18 min · 22 Exercises'),
    ],
  },
  {
    title: 'Stay active, stay in shape', subtitle: 'Daily movement',
    items: [
      w('Morning Warm-up', '7 min'), w('Desk Break Stretch', '6 min'),
      w('Daily Step Booster', '12 min'), w('Evening Wind Down', '10 min'),
    ],
  },
  {
    title: 'For beginners', subtitle: 'Start here',
    items: [
      w('Beginner Full Body', '12 min · 15 Exercises'),
      w('Beginner Abs', '10 min · 12 Exercises'),
      w('Beginner Chest', '11 min · 14 Exercises'),
      w('First Workout Ever', '9 min · 10 Exercises'),
    ],
  },
  {
    title: 'Fast workout', subtitle: 'Short on time?',
    items: [
      w('7 Min Classic', '7 min'), w('10 Min Abs', '10 min'),
      w('Quick HIIT Burn', '9 min'), w('Express Full Body', '12 min'),
    ],
  },
  {
    title: 'Challenge', subtitle: 'Commit and transform',
    items: [
      w('7x4 Challenge', '7 Days · 4 rounds'),
      w('Lose Weight For Men', '30 Days'),
      w('Six Pack Challenge', '30 Days'),
      w('Plank Challenge', '21 Days'),
    ],
  },
  {
    title: 'With equipment', subtitle: 'Dumbbells & more',
    items: [
      w('Dumbbells Abs Shaper', '14 min'),
      w('Easy Arm Workout with Dumbbells', '16 min'),
      w('Dumbbell Mass Builder', '28 min'),
      w('Chair Leg Workout', '13 min'),
    ],
  },
  {
    title: 'Stretch', subtitle: 'Recover better',
    items: STRETCH_WORKOUTS.slice(0, 5),
  },
  {
    title: 'Body focus', subtitle: 'Target an area',
    items: [
      w('Abs Beginner', '12 min · 15 Exercises'),
      w('Arm Beginner', '18 min · 19 Exercises'),
      w('Leg Beginner', '20 min · 21 Exercises'),
      w('Shoulder & Back Beginner', '19 min · 20 Exercises'),
    ],
  },
];

/* -------------------------- Builder filter data ------------------------- */
export const BUILDER_FILTERS = {
  FocusArea: ['All Areas', 'Abs', 'Arm', 'Chest', 'Leg', 'Back', 'Shoulder', 'Full Body'],
  Difficulty: ['All Levels', 'Beginner', 'Intermediate', 'Advanced'],
  Type: ['All Types', 'Strength', 'Cardio', 'Stretch', 'HIIT'],
  Equipment: ['All Equipment', 'None', 'Dumbbell', 'Chair', 'Band'],
};
export const TOTAL_EXERCISES = 369;
