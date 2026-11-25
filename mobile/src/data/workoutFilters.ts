export type LevelKey = 'all' | '1' | '2' | '3' | 'pro';

/** Onboarding/body-focus labels → real plan categories in the database. */
const CATEGORY_ALIASES: Record<string, string> = {
  'full body': 'full_body',
  'fullbody': 'full_body',
  shoulders: 'shoulder',
  shoulder: 'shoulder',
  arm: 'arms',
  abs: 'abs',
  chest: 'chest',
  legs: 'legs',
  leg: 'legs',
  hiit: 'hiit',
};

export function normalizeCategory(value: string): string {
  const v = String(value || '').trim().toLowerCase();
  return CATEGORY_ALIASES[v] || v;
}
