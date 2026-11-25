import { Platform, StyleSheet } from 'react-native';
import { colors } from './colors';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 9,
  lg: 12,
  xl: 14,
  pill: 999,
} as const;

export const typography = {
  h1: { fontSize: 30, fontWeight: '800' as const, lineHeight: 36, letterSpacing: -0.6 },
  h2: { fontSize: 24, fontWeight: '800' as const, lineHeight: 30, letterSpacing: -0.4 },
  h3: { fontSize: 19, fontWeight: '700' as const, lineHeight: 25 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: '700' as const, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '500' as const, lineHeight: 18 },
  tiny: { fontSize: 11, fontWeight: '600' as const, lineHeight: 15 },
  hero: { fontSize: 64, fontWeight: '800' as const, lineHeight: 72 },
  button: { fontSize: 16, fontWeight: '700' as const, lineHeight: 22 },
};

export const shadows = {
  card: Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 4 },
    default: {},
  }),
  button: Platform.select({
    ios: { shadowColor: colors.primary, shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 6 },
    default: {},
  }),
};

export const globalStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  container: {
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    ...shadows.card,
  },
});
