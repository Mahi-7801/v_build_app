/**
 * Flat-design character illustrations extracted from Home Workout v1.8.2.
 * Used by ExerciseArt on every screen (Home, Workouts, Progress, Player, etc.)
 * because Lottie cannot run inside Expo Go.
 */
export const CHARACTER_IMAGES: any[] = [
  require('../../assets/onboarding/real/img_guide_gender_m.webp'),
  require('../../assets/onboarding/real/img_guide_gender_f.webp'),
  require('../../assets/onboarding/real/img_guide_coach_male.webp'),
  require('../../assets/onboarding/real/img_guide_student_1.webp'),
  require('../../assets/onboarding/real/img_guide_student_2.webp'),
  require('../../assets/onboarding/real/img_bf_fullbody_m.webp'),
  require('../../assets/onboarding/real/img_bf_fullbody_f.webp'),
  require('../../assets/onboarding/real/img_our_plan_man.webp'),
  require('../../assets/onboarding/real/img_plancard_m_up.webp'),
  require('../../assets/onboarding/real/img_plancard_f_up.webp'),
  require('../../assets/onboarding/body_male.webp'),
  require('../../assets/onboarding/body_female.webp'),
];

/** Stable image for an exercise id, so a workout always shows the same character. */
export function characterFor(actionId?: number | null): any {
  const id = Math.abs(Math.trunc(Number(actionId) || 0));
  return CHARACTER_IMAGES[id % CHARACTER_IMAGES.length];
}

import { CHARACTER_FALLBACK_SVGS } from './characterFallbackSvgs';

/** Real flat-design character fallback SVG for action IDs without bundled GIFs. */
export function characterXml(actionId?: number | null): string | null {
  const id = Math.abs(Math.trunc(Number(actionId) || 0));
  return CHARACTER_FALLBACK_SVGS[String(id)] || null;
}
