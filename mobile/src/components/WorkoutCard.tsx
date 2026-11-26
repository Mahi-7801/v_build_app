import React from 'react';
import { View, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { Text } from './LocalizedText';
import { colors } from '../theme/colors';
import { radius, spacing, typography, shadows } from '../theme/theme';
import { Icon } from './Icon';
import { ExerciseArt } from './ExerciseArt';
import type { ExploreWorkout, WorkoutPlan } from '../types';

const TINTS = [
  ['#E8F0FF', '#C9DCFF'],
  ['#FFE9E3', '#FFD2C4'],
  ['#EFE8FF', '#DCCFFF'],
  ['#E4F7F2', '#C4EDE2'],
  ['#FFF3D9', '#FFE5AE'],
  ['#FFE9F1', '#FFD0E0'],
];

// Most recovered plans start with the same push-up action, so cards would all
// show the identical figure. Rotate through distinct exercises for variety.
const ROTATING_ART = [15, 28, 55, 69, 88, 127, 143, 198, 264, 363];
const COMMON_FIRST_ACTION = 15;

interface ExploreProps {
  workout: ExploreWorkout;
  onPress: () => void;
  index?: number;
  compact?: boolean;
}

/** Home card: illustration-led, inset from both edges, with clear press feedback. */
export const WorkoutCard = React.memo(function WorkoutCard({ workout, onPress, index = 0, compact }: ExploreProps) {
  const { width } = useWindowDimensions();
  const cardWidth = compact ? 154 : Math.min(220, width * 0.60);
  const tint = TINTS[index % TINTS.length];
  const locked = workout.lock === '1_1';
  const firstAction = Number(workout.firstActionId || 0);
  const artId = firstAction && firstAction !== COMMON_FIRST_ACTION
    ? firstAction
    : ROTATING_ART[index % ROTATING_ART.length];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { width: cardWidth },
        pressed && styles.cardActive,
      ]}
    >
      <View style={[styles.art, { backgroundColor: tint[0] }]}>
        <View style={styles.glow} />
        <ExerciseArt
          actionId={artId}
          size={compact ? 104 : 128}
          style={styles.animation}
          glyph="◇"
        />
        {locked && (
          <View style={styles.proBadge}>
            <Icon name="crown" size={10} color={colors.white} />
            <Text style={styles.badgeText}>PRO</Text>
          </View>
        )}
        <View style={styles.timeBadge}>
          <Icon name="clock" size={10} color={colors.primary} />
          <Text style={styles.timeText}>{workout.minutes || Math.round(workout.durationSec / 60) || 7} min</Text>
        </View>
      </View>
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={2}>{workout.name}</Text>
        {!compact && !!workout.description && (
          <Text style={styles.subtitle} numberOfLines={2}>{workout.description}</Text>
        )}
      </View>
      <View style={styles.activeBar} />
    </Pressable>
  );
});

interface PlanProps {
  plan: WorkoutPlan;
  onPress: () => void;
  index?: number;
}

export const PlanCard = React.memo(function PlanCard({ plan, onPress, index = 0 }: PlanProps) {
  const tint = TINTS[index % TINTS.length];
  const first = Number(plan.first_action_id || 0);
  const artId = first && first !== COMMON_FIRST_ACTION
    ? first
    : ROTATING_ART[index % ROTATING_ART.length];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.planCard, pressed && styles.planActive]}
    >
      <View style={[styles.planArt, { backgroundColor: tint[0] }]}>
        <ExerciseArt actionId={artId} size={64} glyph="◇" />
        {!!plan.is_pro && (
          <View style={styles.proBadgeSmall}>
            <Icon name="crown" size={9} color={colors.white} />
          </View>
        )}
      </View>
      <View style={styles.planMeta}>
        <Text style={styles.planTitle} numberOfLines={1}>{plan.name}</Text>
        <Text style={styles.planSub} numberOfLines={1}>
          {plan.total_exercises} moves · {Math.round(plan.duration_sec / 60)} min · L{plan.level}
        </Text>
      </View>
      <View style={styles.arrow}><Icon name="chevron" size={16} color={colors.textMuted} /></View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.white,
    ...shadows.card,
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginRight: spacing.md + 2,   // 14px gap between cards
    marginBottom: 2,               // 2px vertical breathing room
  },
  cardActive: {
    transform: [{ scale: 0.97 }],
    borderColor: colors.primary,
    opacity: 0.92,
  },
  art: { height: 142, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  glow: {
    position: 'absolute', width: 150, height: 150, borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.45)', top: -50, right: -30,
  },
  animation: { zIndex: 2 },
  proBadge: {
    position: 'absolute', top: 10, left: 10, zIndex: 3,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.pro, borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  badgeText: { color: colors.white, fontSize: 10, fontWeight: '800' },
  timeBadge: {
    position: 'absolute', bottom: 10, right: 10, zIndex: 3,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.white, borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  timeText: { color: colors.primary, fontSize: 10, fontWeight: '800' },
  meta: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.lg },
  title: { ...typography.bodyBold, color: colors.text, minHeight: 38, lineHeight: 19 },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 4, lineHeight: 16 },
  activeBar: {
    height: 3, marginHorizontal: spacing.md, marginBottom: spacing.sm,
    borderRadius: 2, backgroundColor: colors.primary, opacity: 0.75,
  },

  planCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.xl,
    padding: spacing.sm, marginBottom: spacing.sm, ...shadows.card,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  planActive: { transform: [{ scale: 0.985 }], borderColor: colors.primary, backgroundColor: '#F7F9FF' },
  planArt: {
    width: 74, height: 74, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  proBadgeSmall: { position: 'absolute', top: 5, right: 5, backgroundColor: colors.pro, borderRadius: 8, padding: 3 },
  planMeta: { flex: 1 },
  planTitle: { ...typography.bodyBold, color: colors.text, fontSize: 15 },
  planSub: { ...typography.caption, color: colors.textSecondary, marginTop: 5 },
  arrow: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center',
    marginRight: 4,
  },
});
