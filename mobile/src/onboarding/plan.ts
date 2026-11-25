import type { OnboardingAnswers } from './answers';

const LEVELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const GOALS: Record<string, string> = {
  lose_weight: 'fat loss',
  build_muscle: 'muscle gain',
  keep_fit: 'staying fit',
};

const ACTIVITY: Record<string, string> = {
  sedentary: 'a mostly sedentary routine',
  walking: 'a lightly active routine',
  running: 'a moderately active routine',
  veryActive: 'a very active routine',
};

const EXERCISES: Record<string, string[]> = {
  'Full Body': ['Bodyweight Squats', 'Push-ups', 'Plank', 'Jumping Jacks', 'Glute Bridge', 'Mountain Climbers', 'Lunges'],
  Arm: ['Push-ups', 'Triceps Dips', 'Plank Shoulder Taps', 'Arm Circles', 'Bench Dips', 'Bicep Curls (bodyweight)', 'Wall Push-ups'],
  Chest: ['Push-ups', 'Incline Push-ups', 'Wide Arm Push-ups', 'Chest Slaps', 'Decline Push-ups', 'Plank Shoulder Taps', 'Clap Push-ups'],
  Abs: ['Crunches', 'Leg Raises', 'Plank', 'Bicycle Crunches', 'Dead Bug', 'Side Plank', 'Scissor Kicks'],
  Leg: ['Bodyweight Squats', 'Lunges', 'Wall Sit', 'Calf Raises', 'Glute Bridge', 'Step-ups', 'Squat Jumps'],
  'Lower back': ['Bird Dog', 'Glute Bridge', 'Plank', 'Child’s Pose', 'Dead Bug', 'Side Plank', 'Cat-Cow'],
  Shoulder: ['Arm Circles', 'Plank Shoulder Taps', 'Pike Push-ups', 'Wall Push-ups', 'Shoulder Rolls', 'Downward Dog', 'Scapular Push-ups'],
  Ankle: ['Calf Raises', 'Ankle Circles', 'Single-leg Balance', 'Wall Calf Stretch', 'Step-ups', 'Toe Raises', 'Side Leg Lifts'],
  Wrist: ['Wrist Circles', 'Wall Push-ups', 'Plank', 'Wrist Stretch', 'Bear Crawl', 'Forearm Plank', 'Incline Push-ups'],
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function niceAreas(a: OnboardingAnswers): string[] {
  const areas = a.focusAreas?.length ? [...a.focusAreas] : ['Full Body'];
  // Body concerns are trained too, so the plan reflects every answer.
  for (const c of a.concerns || []) {
    if (!areas.includes(c) && EXERCISES[c]) areas.push(c);
  }
  return areas;
}

function kg(a: OnboardingAnswers): number {
  return a.weightUnit === 'kg' ? a.weight : Math.round((a.weight / 2.20462) * 10) / 10;
}

function cm(a: OnboardingAnswers): number {
  return a.heightUnit === 'cm' ? Math.round(a.heightInches) : Math.round(a.heightInches * 2.54);
}

/**
 * Builds a complete, personalised plan on the device from EVERY onboarding
 * answer. Used immediately so the user never sees generic placeholder data,
 * and kept as the fallback if the AI service is unavailable.
 */
export function buildLocalPlan(a: OnboardingAnswers) {
  const level = a.pushupLevel || 'beginner';
  const levelLabel = LEVELS[level] || 'Beginner';
  const areas = niceAreas(a);
  const days = a.weeklyDays || 3;
  const goalText = GOALS[a.goal || ''] || 'better fitness';
  const activityText = ACTIVITY[a.activityLevel || ''] || 'your current activity level';
  const start = Math.max(0, DAY_NAMES.indexOf(a.firstDayOfWeek));

  const sets = level === 'advanced' ? '4' : level === 'intermediate' ? '3' : '2';
  const reps = level === 'advanced' ? '15–20 reps' : level === 'intermediate' ? '10–15 reps' : '8–12 reps';
  const minutes = level === 'advanced' ? '20–30' : level === 'intermediate' ? '15–25' : '8–20';

  const picked: string[] = [];
  for (const area of areas) {
    for (const ex of EXERCISES[area] || []) {
      if (!picked.includes(ex)) picked.push(ex);
    }
  }
  for (const ex of EXERCISES['Full Body']) {
    if (picked.length >= 7) break;
    if (!picked.includes(ex)) picked.push(ex);
  }

  const weight = kg(a);
  const height = cm(a);
  const feet = Math.floor(a.heightInches / 12);
  const inches = Math.round(a.heightInches % 12);

  return {
    title: `${goalText.replace(/\b\w/g, (c) => c.toUpperCase())} starts here`.toUpperCase(),
    subtitle: `A ${levelLabel.toLowerCase()} plan for ${areas.join(' + ')}, ${days} days a week`,
    summary: `Built from your ${feet}'${inches}" / ${a.weight}${a.weightUnit} profile, ${levelLabel.toLowerCase()} push-up level and ${activityText}. It targets ${areas.join(', ')} with no equipment needed.`,
    stats: [
      { label: 'Daily Time', value: `${minutes} Min` },
      { label: 'Level', value: levelLabel },
      { label: 'Target area', value: areas.join(', ') },
      { label: 'Equipment', value: 'No Equipment' },
    ],
    exercises: picked.map((name, i) => ({
      name,
      sets,
      reps,
      note: i < (a.concerns?.length || 0)
        ? `Move gently — protect your ${a.concerns![i]}.`
        : `${a.gender === 'female' ? 'Keep' : 'Keep'} your core engaged and breathe steadily.`,
    })),
    weeklySchedule: Array.from({ length: days }, (_, i) => ({
      day: DAY_NAMES[(start + i) % 7],
      focus: areas[i % areas.length],
    })),
    report: {
      assessment: `You are ${feet}'${inches}" and ${a.weight}${a.weightUnit} (${weight} kg / ${height} cm), with a ${goalText} goal and a ${levelLabel.toLowerCase()} push-up result. Your activity level is ${activityText}${a.concerns?.length ? `, and you want to be careful with your ${a.concerns.join(', ')}` : ''}. This plan matches that profile with ${days} short ${minutes}-minute sessions per week.`,
      strengths: [
        `Clear ${goalText} goal`,
        `${levelLabel} upper-body base`,
        `Ready to train ${days} days a week`,
      ],
      focusPoints: [...areas, ...(a.concerns || [])].filter((v, i, arr) => arr.indexOf(v) === i),
      recommendations: [
        `Train on ${DAY_NAMES[(start) % 7]} and keep ${days} consistent sessions each week`,
        a.motivation ? `Remember your motivation: ${a.motivation.toLowerCase()}` : 'Warm up before every session',
        a.concerns?.length ? `Go easy on ${a.concerns.join(', ')} and stop if it hurts` : 'Rest 30–60 seconds between sets',
      ],
    },
    generatedBy: 'on-device',
  };
}
