/**
 * Design tokens recovered from the original APK:
 *   res/values/colors.xml + assets/explore_default/config -> style
 * Primary #004AFF, gradient #0075FF -> #004AFF, dark #1C212C,
 * canvas #f6f8fa, headline Outfit.
 */
export const colors = {
  primary: '#004AFF',
  primaryLight: '#0075FF',
  primaryDark: '#0034B8',
  gradientFrom: '#0075FF',
  gradientTo: '#004AFF',

  dark: '#1C212C',
  darkSoft: '#2A3140',
  canvas: '#F6F8FA',
  white: '#FFFFFF',

  text: '#1C212C',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textOnPrimary: '#FFFFFF',

  border: '#E5E9F0',
  divider: '#EEF1F6',

  success: '#22C55E',
  warning: '#FF9F0A',
  danger: '#FF4D4F',
  pro: '#FFB020',

  accentOrange: '#FF8558',
  accentYellow: '#FFB24F',
  accentPink: '#FF7A9B',
  accentPurple: '#8B5CF6',
  accentTeal: '#14B8A6',
} as const;

export type ColorName = keyof typeof colors;
