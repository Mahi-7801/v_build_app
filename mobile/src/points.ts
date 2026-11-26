/** Fire points: completing workouts earns points; 5,000 unlocks 40% off PRO. */
export const POINTS_FOR_PRO = 5000;
export const PRO_DISCOUNT_PERCENT = 40;
export const PRO_PRICE_CENTS = 2999;

/** Each completed workout (abs beginner, HIIT, stretching, ...) earns 5 points. */
export const POINTS_PER_WORKOUT = 5;

export function pointsForSession(_info?: {
  durationSec?: number; calories?: number; exercisesDone?: number;
}) {
  return POINTS_PER_WORKOUT;
}

export function discountedPriceCents(points: number) {
  return points >= POINTS_FOR_PRO
    ? Math.round(PRO_PRICE_CENTS * (100 - PRO_DISCOUNT_PERCENT) / 100)
    : PRO_PRICE_CENTS;
}

export function formatPoints(n: number) {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(n)));
}

/** Short money value for dense tiles (no decimals). */
export function compactMoney(amount: number, currency = 'INR') {
  const n = Math.round(Number(amount) || 0);
  const formatted = new Intl.NumberFormat('en-IN').format(n);
  return currency === 'INR' ? `₹${formatted}` : `$${formatted}`;
}

/** Money display. INR uses ₹ and Indian digit grouping; other currencies keep $. */
export function formatMoney(amount: number, currency = 'INR') {
  const n = Math.max(0, Number(amount) || 0);
  if (currency === 'INR') {
    return `₹${new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(n)}`;
  }
  return `$${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)}`;
}
