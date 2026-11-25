import React from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, Animated } from 'react-native';
import { Text } from './LocalizedText';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/theme';
import { Icon } from './Icon';
import { formatPoints } from '../points';
import { useAppStore } from '../store/useAppStore';

export type ChipInfo =
  | { kind: 'points'; points: number; sessions: number }
  | { kind: 'sessions'; sessions: number; totals: any }
  | { kind: 'level'; level: string; focusAreas: string[]; weeklyDays: number; goal?: string };

/** Popup detail for the small home-screen stat chips (same style as CalendarModal). */
export function ChipInfoModal({
  info, onClose,
}: {
  info: ChipInfo | null;
  onClose: () => void;
}) {
  const pointsTarget = useAppStore((s) => s.pointsTarget);
  const discountPercent = useAppStore((s) => s.proDiscountPercent);
  const pop = React.useRef(new Animated.Value(0.9)).current;
  React.useEffect(() => {
    if (info) {
      pop.setValue(0.9);
      Animated.spring(pop, { toValue: 1, friction: 7, useNativeDriver: true }).start();
    }
  }, [info, pop]);

  if (!info) return null;

  const kicker = info.kind === 'points' ? 'FIRE POINTS'
    : info.kind === 'sessions' ? 'YOUR PROGRESS' : 'FITNESS LEVEL';
  const title = info.kind === 'points' ? `${formatPoints(info.points)} pts`
    : info.kind === 'sessions' ? `${info.sessions} workouts done`
    : info.level;
  const icon: any = info.kind === 'points' ? 'flame'
    : info.kind === 'sessions' ? 'trophy' : 'award';

  const rows: Array<{ label: string; value: string }> = [];
  if (info.kind === 'points') {
    const left = Math.max(0, pointsTarget - info.points);
    rows.push(
      { label: 'Workouts completed', value: String(info.sessions) },
      { label: 'Reward at', value: `${formatPoints(pointsTarget)} points` },
      { label: 'PRO discount', value: info.points >= pointsTarget ? `${discountPercent}% unlocked` : `${discountPercent}% locked` },
      { label: 'Still to earn', value: left ? formatPoints(left) : 'Reward unlocked' },
    );
  } else if (info.kind === 'sessions') {
    rows.push(
      { label: 'Sessions', value: String(info.totals?.sessions ?? 0) },
      { label: 'Total minutes', value: String(Math.round(Number(info.totals?.minutes || 0))) },
      { label: 'Calories burned', value: String(Math.round(Number(info.totals?.calories || 0))) },
      { label: 'Exercises', value: String(info.totals?.exercises ?? 0) },
    );
  } else {
    rows.push(
      { label: 'Focus areas', value: info.focusAreas?.length ? info.focusAreas.join(', ') : 'Full Body' },
      { label: 'Training days', value: `${info.weeklyDays} days / week` },
      { label: 'Goal', value: info.goal ? String(info.goal).replace(/_/g, ' ') : 'Stay fit' },
    );
  }

  const progress = info.kind === 'points'
    ? Math.min(100, (info.points / pointsTarget) * 100) : 0;

  return (
    <Modal visible={!!info} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, { transform: [{ scale: pop }] }]}>
          <View style={styles.head}>
            <View>
              <Text style={styles.kicker}>{kicker}</Text>
              <Text style={styles.title}>{title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.close}>
              <Icon name="close" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.heroIcon}>
            <Icon name={icon} size={30} color={info.kind === 'points' ? '#FF8A29' : colors.primary} />
          </View>

          {info.kind === 'points' && (
            <View style={styles.progressBlock}>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {formatPoints(info.points)} / {formatPoints(pointsTarget)} points
              </Text>
              {info.points >= pointsTarget && (
                <View style={styles.reward}>
                  <Icon name="crown" size={14} color="#B36A00" />
                  <Text style={styles.rewardText}>{discountPercent}% OFF PRO UNLOCKED</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.rows}>
            {rows.map((r) => (
              <View key={r.label} style={styles.row}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={styles.rowValue} numberOfLines={1}>{r.value}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity onPress={onClose} style={styles.done}>
            <Text style={styles.doneText}>DONE</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,16,32,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 380, backgroundColor: colors.white, borderRadius: 22, padding: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { ...typography.tiny, color: colors.primary, fontWeight: '800', letterSpacing: 1.2 },
  title: { ...typography.h2, color: colors.text, marginTop: 4 },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  heroIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#EAF0FF',
    alignItems: 'center', justifyContent: 'center', marginTop: 16, alignSelf: 'center',
  },
  progressBlock: { marginTop: 14 },
  track: { height: 8, borderRadius: 4, backgroundColor: '#F0F1F5', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: '#FF9A3D' },
  progressText: { ...typography.tiny, color: colors.textSecondary, marginTop: 6, textAlign: 'center' },
  reward: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FFF0D6', borderRadius: radius.pill, paddingVertical: 7, marginTop: 10 },
  rewardText: { fontSize: 11, fontWeight: '900', color: '#B36A00' },
  rows: { marginTop: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 8 },
  rowLabel: { ...typography.caption, color: colors.textSecondary, flexShrink: 1 },
  rowValue: { ...typography.bodyBold, color: colors.text, maxWidth: '58%', textAlign: 'right' },
  done: { marginTop: 18, backgroundColor: colors.primary, borderRadius: radius.pill, height: 44, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: colors.white, fontWeight: '800', letterSpacing: 1 },
});
