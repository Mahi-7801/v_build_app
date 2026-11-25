import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Share, TouchableOpacity } from 'react-native';
import { Text } from '../components/LocalizedText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors } from '../theme/colors';
import { radius, spacing, typography, shadows } from '../theme/theme';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { achievementsApi } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { formatPoints } from '../points';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

export default function ResultScreen({ route }: Props) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { durationSec, calories, exercisesDone, exercisesTotal, sessionId, title, pointsEarned = 0 } = route.params || {};
  const pop = useRef(new Animated.Value(0.6)).current;
  const { user, addPoints, refreshUser, pointsTarget, proDiscountPercent } = useAppStore();

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 6, useNativeDriver: true }).start();
    if (pointsEarned) addPoints(pointsEarned);
    if (sessionId) {
      achievementsApi.recalculate().catch(() => {});
      refreshUser();
    }
  }, [pop, sessionId, pointsEarned, addPoints, refreshUser]);

  const totalPoints = Number(user?.points || 0);
  const progress = Math.min(100, (totalPoints / pointsTarget) * 100);
  const hasDiscount = totalPoints >= pointsTarget;

  const mins = Math.max(1, Math.round((durationSec || 0) / 60));

  const share = async () => {
    try {
      await Share.share({
        message: `I just finished "${title}" in ${mins} minutes and burned ${Math.round(calories || 0)} calories with V_build! 💪`,
      });
    } catch { /* cancelled */ }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        <Animated.View style={{ transform: [{ scale: pop }], alignItems: 'center' }}>
          <View style={styles.badge}><Icon name="trophy" size={46} color={colors.white} /></View>
        </Animated.View>
        <Text style={styles.congrats}>Workout complete!</Text>
        <Text style={styles.sub}>{title} — great job showing up today.</Text>

        <View style={styles.stats}>
          <ResultStat icon="clock" value={`${mins}`} unit="min" label="Duration" />
          <ResultStat icon="flame" value={`${Math.round(calories || 0)}`} unit="kcal" label="Calories" />
          <ResultStat icon="check" value={`${exercisesDone || 0}`} unit={`/${exercisesTotal || 0}`} label="Exercises" />
        </View>

        <View style={styles.pointsCard}>
          <View style={styles.pointsTop}>
            <View style={styles.pointsIcon}><Icon name="flame" size={22} color="#FF7A00" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pointsEarned}>+{formatPoints(pointsEarned)} fire points</Text>
              <Text style={styles.pointsTotal}>
                {hasDiscount
                  ? `${formatPoints(totalPoints)} points · PRO reward unlocked`
                  : `${formatPoints(totalPoints)} / ${formatPoints(pointsTarget)} points to PRO reward`}
              </Text>
            </View>
            {hasDiscount && (
              <View style={styles.discountChip}>
                <Text style={styles.discountText}>{proDiscountPercent}% OFF</Text>
              </View>
            )}
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          {!hasDiscount && (
            <Text style={styles.pointsHint}>
              Earn {formatPoints(Math.max(0, pointsTarget - totalPoints))} more to get {proDiscountPercent}% off PRO.
            </Text>
          )}
        </View>

        <View style={styles.quote}>
          <Text style={styles.quoteText}>“The body achieves what the mind believes.”</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Button title="Back to home" full onPress={() => nav.reset({ index: 0, routes: [{ name: 'Main' }] })} />
        <TouchableOpacity onPress={share} style={styles.share}>
          <Icon name="share" size={18} color={colors.primary} />
          <Text style={styles.shareText}>Share your result</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function ResultStat({ icon, value, unit, label }: { icon: any; value: string; unit: string; label: string }) {
  return (
    <View style={[styles.stat, shadows.card]}>
      <Icon name={icon} size={20} color={colors.primary} />
      <View style={styles.statRow}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statUnit}>{unit}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.xxl },
  badge: {
    width: 112, height: 112, borderRadius: 56, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', ...shadows.button,
  },
  congrats: { ...typography.h1, color: colors.text, marginTop: spacing.xl },
  sub: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' },
  stats: { flexDirection: 'row', gap: spacing.sm, width: '100%', marginTop: spacing.xxl },
  stat: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', gap: 4 },
  statRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  statValue: { ...typography.h2, color: colors.text },
  statUnit: { ...typography.tiny, color: colors.textMuted },
  statLabel: { ...typography.tiny, color: colors.textSecondary, textTransform: 'uppercase' },
  pointsCard: {
    width: '100%', marginTop: spacing.lg, backgroundColor: colors.white,
    borderRadius: radius.md, padding: spacing.md, ...shadows.card,
  },
  pointsTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pointsIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF1E4',
    alignItems: 'center', justifyContent: 'center',
  },
  pointsEarned: { ...typography.bodyBold, color: '#E2660A' },
  pointsTotal: { ...typography.tiny, color: colors.textSecondary, marginTop: 2 },
  discountChip: { backgroundColor: '#FFF0D6', borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 5 },
  discountText: { fontSize: 10, fontWeight: '900', color: '#B36A00' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#F0F1F5', marginTop: spacing.md, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: '#FF9A3D' },
  pointsHint: { ...typography.tiny, color: colors.textMuted, marginTop: 8 },
  quote: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  quoteText: { ...typography.body, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center' },
  footer: { padding: spacing.lg },
  share: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.lg },
  shareText: { ...typography.body, color: colors.primary, fontWeight: '700' },
});
