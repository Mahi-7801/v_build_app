import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Modal, TextInput } from 'react-native';
import { Text } from '../components/LocalizedText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from '../navigation/RootNavigator';
import { colors } from '../theme/colors';
import { radius, spacing, typography, shadows } from '../theme/theme';
import { Icon } from '../components/Icon';
import { ExerciseArt } from '../components/ExerciseArt';
import { achievementsApi, healthApi, historyApi, usersApi } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { label } from '../i18n/labels';
import { ScreenEnter } from '../components/ScreenEnter';
import type { HistorySession } from '../types';
import { formatPoints } from '../points';
import { BmiGauge } from '../components/FitnessExtras';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Progress'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

const PROGRESS_CACHE_TTL = 60_000;
let progressCache: {
  at: number; userId: string | number | null; limit: number;
  sessions: HistorySession[]; totals: any; badges: any[]; calendarDays: any[]; weights: any[];
} | null = null;

export default function HistoryScreen() {
  const nav = useNavigation<Nav>();
  const lang = useAppStore((s) => s.lang);
  const user = useAppStore((s) => s.user);
  const profile = useAppStore((s) => s.profile);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [historyLimit, setHistoryLimit] = useState(40);
  const canReuse = progressCache && progressCache.userId === (user?.id ?? null);
  const [sessions, setSessions] = useState<HistorySession[]>(() => (canReuse ? progressCache!.sessions : []));
  const [totals, setTotals] = useState(() => (canReuse ? progressCache!.totals : { sessions: 0, total_seconds: 0, total_calories: 0 }));
  const [badges, setBadges] = useState<any[]>(() => (canReuse ? progressCache!.badges : []));
  const [calendarDays, setCalendarDays] = useState<any[]>(() => (canReuse ? progressCache!.calendarDays : []));
  const [weights, setWeights] = useState<any[]>(() => (canReuse ? progressCache!.weights : []));
  const [refreshing, setRefreshing] = useState(false);
  const [metricModal, setMetricModal] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [heightInput, setHeightInput] = useState('');

  const load = useCallback(async (force = false) => {
    const uid = user?.id ?? null;
    if (!uid) { setRefreshing(false); return; }
    if (!force && progressCache && progressCache.userId === uid
      && progressCache.limit === historyLimit && Date.now() - progressCache.at < PROGRESS_CACHE_TTL) {
      setSessions(progressCache.sessions);
      setTotals(progressCache.totals);
      setBadges(progressCache.badges);
      setCalendarDays(progressCache.calendarDays);
      setWeights(progressCache.weights);
      setRefreshing(false);
      return;
    }
    try {
      const [h, d, a, cal, hl] = await Promise.all([
        historyApi.list({ limit: historyLimit }),
        usersApi.dashboard().catch(() => null),
        achievementsApi.mine().catch(() => null),
        historyApi.calendar().catch(() => ({ data: { days: [] } })),
        healthApi.list().catch(() => ({ data: { records: [] } })),
      ]);
      const nextSessions = h.data.items || [];
      const nextTotals = d?.data?.totals || { sessions: 0, total_seconds: 0, total_calories: 0 };
      const nextBadges = a?.data?.achievements || [];
      const nextCal = cal.data?.days || [];
      const recs = (hl.data?.records || []).filter((r: any) => r.weight_kg != null);
      setSessions(nextSessions);
      setTotals(nextTotals);
      setBadges(nextBadges);
      setCalendarDays(nextCal);
      setWeights(recs);
      progressCache = {
        at: Date.now(), userId: uid, limit: historyLimit,
        sessions: nextSessions, totals: nextTotals, badges: nextBadges, calendarDays: nextCal, weights: recs,
      };
      const latest = recs[recs.length - 1];
      setWeightInput(latest ? String(latest.weight_kg) : String(profile.weightKg || settings.weight_kg || ''));
      setHeightInput(String(profile.heightCm || settings.height_cm || ''));
    } catch { /* ignore */ }
    finally { setRefreshing(false); }
  }, [historyLimit, profile.heightCm, profile.weightKg, settings.height_cm, settings.weight_kg, user?.id]);

  useFocusEffect(useCallback(() => { load(false); }, [load]));

  // --- Report-tab data --------------------------------------------------
  const doneDates = new Set(calendarDays.filter((d: any) => Number(d.sessions) > 0).map((d: any) => d.activity_date));
  const sortedDone = Array.from(doneDates).sort();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  let streak = 0;
  let cursor = doneDates.has(isoDate(today)) ? new Date(today) : new Date(yesterday);
  while (doneDates.has(isoDate(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  let bestStreak = 0;
  let run = 0;
  sortedDone.forEach((day, i) => {
    run = i > 0 && daysBetween(sortedDone[i - 1], day) === 1 ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
  });
  const reportWeek = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(today.getDate() - (6 - i));
    return { key: i, name: DAY_NAMES[d.getDay()], date: d.getDate(), done: doneDates.has(isoDate(d)), isToday: i === 6 };
  });

  const latestWeight = weights.length ? Number(weights[weights.length - 1].weight_kg) : Number(profile.weightKg || settings.weight_kg || 0);
  const heightCm = Number(profile.heightCm || settings.height_cm || 0);
  const bmi = latestWeight > 0 && heightCm > 0 ? latestWeight / ((heightCm / 100) ** 2) : 0;
  const bmiLabel = !bmi ? '—' : bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
  const weightPoints = weights.slice(-8);
  const allWeights = weights.map((w: any) => Number(w.weight_kg)).filter((v: number) => Number.isFinite(v) && v > 0);
  const heaviest = allWeights.length ? Math.max(...allWeights) : null;
  const lightest = allWeights.length ? Math.min(...allWeights) : null;
  const wValues = weightPoints.map((w: any) => Number(w.weight_kg));
  const wMin = wValues.length ? Math.min(...wValues) : 0;
  const wMax = wValues.length ? Math.max(...wValues) : 0;
  const addWeight = async () => {
    const w = parseFloat(weightInput);
    if (!Number.isFinite(w) || w <= 0) return;
    const date = isoDate(new Date());
    try { await healthApi.sync([{ date, weightKg: w }], 'manual'); } catch { /* keep local value */ }
    const h = parseFloat(heightInput);
    if (Number.isFinite(h) && h > 0) await updateSettings({ height_cm: h } as any);
    setWeights((prev) => [...prev.filter((r: any) => r.record_date !== date), { record_date: date, weight_kg: w }]
      .sort((a: any, b: any) => String(a.record_date).localeCompare(String(b.record_date))));
    setMetricModal(false);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} />}
      >
        <ScreenEnter>

          <View style={styles.hero}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroKicker}>YOUR IMPACT</Text>
              <Text style={styles.heroValue}>{Math.round(totals.total_seconds / 60)}<Text style={styles.heroUnit}> min</Text></Text>
              <Text style={styles.heroLabel}>of training completed</Text>
            </View>
            <View style={styles.heroArt}>
              <ExerciseArt actionId={sessions.length ? 15 : 0} size={120} glyph="★" />
            </View>
          </View>

          <View style={styles.stats}>
            <Mini icon="check" value={String(totals.sessions)} label="Workouts" />
            <Mini icon="clock" value={String(Math.round(totals.total_seconds / 60))} label="Minutes" />
            <Mini icon="flame" value={String(Math.round(totals.total_calories))} label="kcal" />
            <Mini icon="trophy" value={formatPoints(Number(user?.points || 0))} label="Fire pts" />
          </View>
          <Text style={styles.statsNote}>
            Totals come from finished workouts. Each workout earns fire points — reach 5,000 for 40% off PRO.
          </Text>

          {/* History calendar + day streak — as in the real Report tab */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>History</Text>
              <TouchableOpacity onPress={() => setHistoryLimit((n) => (n >= 200 ? 40 : 200))}>
                <Text style={styles.cardAction}>{historyLimit >= 200 ? 'Show less' : 'All records'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.weekRow}>
              {reportWeek.map((d) => (
                <View key={d.key} style={styles.weekWrap}>
                  <View style={[styles.weekTile, d.done && styles.weekTileDone, d.isToday && styles.weekTileToday]}>
                    <Text style={[styles.weekDay, (d.done || d.isToday) && styles.weekDayOn]}>{d.name.charAt(0)}</Text>
                    <Text style={[styles.weekDate, (d.done || d.isToday) && styles.weekDayOn]}>{d.date}</Text>
                  </View>
                  {d.done && <View style={styles.weekDot} />}
                </View>
              ))}
            </View>
            <View style={styles.streakRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={styles.fireBadge}><Icon name="flame" size={16} color="#FF8A29" /></View>
                <View>
                  <Text style={styles.streakLabel}>Day Streak</Text>
                  <Text style={styles.streakValue}>{streak} days</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.streakLabel}>Personal Best</Text>
                <Text style={styles.streakValue}>{bestStreak} days</Text>
              </View>
            </View>
          </View>

          {/* Weight chart + BMI — as in the real Report tab */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Weight</Text>
              <TouchableOpacity style={styles.editBtn} onPress={() => setMetricModal(true)}>
                <Text style={styles.editBtnText}>Log</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.currentRow}>
              <View>
                <Text style={styles.weightLabel}>Current</Text>
                <Text style={styles.currentWeight}>{latestWeight > 0 ? `${latestWeight.toFixed(1)} kg` : '--'}</Text>
              </View>
              <View style={styles.weightStats}>
                <View style={styles.weightStat}><Text style={styles.weightLabel}>Heaviest</Text><Text style={styles.weightStatValue}>{heaviest ? `${heaviest.toFixed(1)} kg` : '--'}</Text></View>
                <View style={styles.weightStat}><Text style={styles.weightLabel}>Lightest</Text><Text style={styles.weightStatValue}>{lightest ? `${lightest.toFixed(1)} kg` : '--'}</Text></View>
              </View>
            </View>
            {weightPoints.length > 0 ? (
              <View style={styles.chart}>
                {weightPoints.map((w: any, i: number) => {
                  const value = Number(w.weight_kg);
                  const height = 20 + ((value - wMin) / (wMax - wMin || 1)) * 52;
                  return (
                    <View key={i} style={styles.chartCol}>
                      <View style={[styles.chartBar, { height }]} />
                      <Text style={styles.chartLabel}>{value.toFixed(0)}</Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.emptyChart}>Log your weight to see a trend chart.</Text>
            )}
            <BmiGauge value={bmi} />
            <View style={styles.bmiRow}>
              <View>
                <Text style={styles.bmiValue}>{bmi ? bmi.toFixed(1) : '--'}</Text>
                <Text style={styles.bmiCaption}>BMI · {bmiLabel}</Text>
              </View>
              <TouchableOpacity style={styles.heightBtn} onPress={() => setMetricModal(true)}>
                <Icon name="scale" size={15} color={colors.primary} />
                <Text style={styles.heightText}>Height {heightCm ? `${heightCm} cm` : '—'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {!!badges.length && (
            <View style={styles.badgeSection}>
              <Text style={styles.badgeSectionTitle}>Achievements</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgeList}>
                {badges.map((b: any) => (
                  <View key={b.id} style={styles.badge}>
                    <Icon name="award" size={19} color={b.unlocked_at ? colors.primary : colors.textMuted} />
                    <Text style={styles.badgeTitle} numberOfLines={2}>{b.title}</Text>
                    <Text style={styles.badgeSub}>{b.unlocked_at ? 'Unlocked' : `${b.progress || 0} / ${b.threshold}`}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{label(lang, 'recentWorkouts')}</Text>
            <Text style={styles.sectionHint}>{sessions.length} total</Text>
          </View>

          {sessions.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.row}
              onPress={() => {
                if (s.plan_id) nav.navigate('WorkoutDetail', { planId: s.plan_id });
                else nav.navigate('Workouts');
              }}
            >
              <View style={styles.rowArt}><ExerciseArt actionId={15} size={46} glyph="◆" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{s.title}</Text>
                <Text style={styles.rowSub}>
                  {new Date(s.started_at).toLocaleDateString()} · {Math.round(s.duration_sec / 60)} min · {Math.round(Number(s.total_calories))} kcal
                </Text>
              </View>
              <Icon name="chevron" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
          {!sessions.length && (
            <View style={styles.empty}>
              <ExerciseArt actionId={0} size={110} glyph="◇" />
              <Text style={styles.emptyText}>No workouts yet — start your first one!</Text>
            </View>
          )}
          <View style={{ height: 24 }} />
        </ScreenEnter>
      </ScrollView>

      <Modal visible={metricModal} transparent animationType="slide" onRequestClose={() => setMetricModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Body metrics</Text>
            <Text style={styles.modalLabel}>Weight (kg)</Text>
            <TextInput style={styles.modalInput} keyboardType="numeric" value={weightInput}
              onChangeText={setWeightInput} placeholder="e.g. 68.5" />
            <Text style={styles.modalLabel}>Height (cm)</Text>
            <TextInput style={styles.modalInput} keyboardType="numeric" value={heightInput}
              onChangeText={setHeightInput} placeholder="e.g. 172" />
            <TouchableOpacity style={styles.modalSave} onPress={addWeight}>
              <Text style={styles.modalSaveText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setMetricModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Mini({ icon, value, label }: { icon: any; value: string; label: string }) {
  return (
    <View style={styles.mini}>
      <Icon name={icon} size={16} color={colors.primary} />
      <Text style={styles.miniValue}>{value}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingBottom: 90 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xs },
  headerKicker: { ...typography.tiny, color: colors.primary, fontWeight: '900', letterSpacing: 1.4 },
  headerTitle: { ...typography.h1, color: colors.text, marginTop: 4 },

  hero: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
    backgroundColor: colors.dark, borderRadius: radius.xl,
    padding: spacing.lg, overflow: 'hidden',
  },
  heroCopy: { flex: 1 },
  heroKicker: { ...typography.tiny, color: 'rgba(255,255,255,0.6)', letterSpacing: 1.3 },
  heroValue: { ...typography.h1, color: colors.white, marginTop: 6 },
  heroUnit: { ...typography.body, color: 'rgba(255,255,255,0.8)' },
  heroLabel: { ...typography.caption, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  heroArt: {
    width: 120, height: 126, borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center',
  },

  stats: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  statsNote: {
    ...typography.tiny, color: colors.textMuted,
    paddingHorizontal: spacing.lg, marginTop: 10, lineHeight: 16,
  },
  badgeSection: { marginTop: spacing.xl },
  badgeList: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  badge: {
    width: 104, backgroundColor: colors.white, borderRadius: radius.md,
    padding: spacing.md, alignItems: 'center', gap: 4, ...shadows.card,
  },
  badgeTitle: { ...typography.tiny, color: colors.text, fontWeight: '800', textAlign: 'center' },
  badgeSub: { ...typography.tiny, color: colors.textMuted },
  mini: {
    flex: 1, alignItems: 'center', gap: 3,
    backgroundColor: colors.white, borderRadius: radius.lg,
    paddingVertical: 12, paddingHorizontal: 2, ...shadows.card,
  },
  miniValue: { ...typography.h3, color: colors.text, marginTop: 2 },
  miniLabel: { ...typography.tiny, color: colors.textSecondary, textTransform: 'uppercase' },

  sectionHead: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, marginTop: spacing.xxl, marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.h3, color: colors.text },
  badgeSectionTitle: { ...typography.h3, color: colors.text, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  sectionHint: { ...typography.caption, color: colors.textSecondary },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginHorizontal: spacing.lg, backgroundColor: colors.white,
    borderRadius: radius.lg, padding: spacing.sm, marginBottom: spacing.sm, ...shadows.card,
  },
  rowArt: {
    width: 56, height: 56, borderRadius: radius.md,
    backgroundColor: '#EAF0FF', alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { ...typography.bodyBold, color: colors.text },
  rowSub: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  empty: { alignItems: 'center', paddingVertical: 50, gap: spacing.md },
  emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center' },

  // Report-tab additions
  card: {
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
    backgroundColor: colors.white, borderRadius: radius.xl,
    padding: spacing.lg, ...shadows.card,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  cardTitle: { ...typography.h3, color: colors.text },
  cardAction: { ...typography.caption, color: colors.primary, fontWeight: '800' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  weekWrap: { flex: 1, alignItems: 'center' },
  weekTile: {
    width: 38, height: 50, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border,
  },
  weekTileDone: { backgroundColor: '#EAF0FF', borderColor: '#EAF0FF' },
  weekTileToday: { backgroundColor: colors.primary, borderColor: colors.primary },
  weekDay: { ...typography.tiny, color: colors.textMuted, fontWeight: '800' },
  weekDate: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 2 },
  weekDayOn: { color: colors.white },
  weekDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary, marginTop: 5 },
  streakRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: colors.divider, marginTop: 16, paddingTop: 14,
  },
  fireBadge: {
    width: 34, height: 34, borderRadius: 11,
    backgroundColor: '#FFF3E6', alignItems: 'center', justifyContent: 'center',
  },
  streakLabel: { ...typography.tiny, color: colors.textMuted },
  streakValue: { ...typography.bodyBold, color: colors.text, marginTop: 2 },
  editBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 14, paddingVertical: 6 },
  editBtnText: { ...typography.tiny, color: colors.white, fontWeight: '800' },
  currentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  weightLabel: { ...typography.tiny, color: colors.textMuted, fontWeight: '800' },
  currentWeight: { ...typography.h3, color: colors.text, marginTop: 2 },
  weightStats: { flexDirection: 'row', gap: spacing.lg },
  weightStat: { alignItems: 'flex-end' },
  weightStatValue: { ...typography.caption, color: colors.text, fontWeight: '800', marginTop: 2 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 96, gap: 6 },
  chartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 96 },
  chartBar: { width: '70%', maxWidth: 22, backgroundColor: colors.primary, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  chartLabel: { ...typography.tiny, color: colors.textMuted, marginTop: 5 },
  emptyChart: { ...typography.caption, color: colors.textMuted, textAlign: 'center', paddingVertical: 18 },
  bmiRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: colors.divider, marginTop: 14, paddingTop: 14,
  },
  bmiValue: { ...typography.h2, color: colors.text },
  bmiCaption: { ...typography.tiny, color: colors.textSecondary, marginTop: 2 },
  heightBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EAF0FF', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  heightText: { ...typography.tiny, color: colors.primary, fontWeight: '800' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: spacing.lg, paddingBottom: spacing.xl },
  modalTitle: { ...typography.h3, color: colors.text, marginBottom: 16 },
  modalLabel: { ...typography.tiny, color: colors.textSecondary, fontWeight: '800', marginBottom: 6, marginTop: 10 },
  modalInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 14, height: 46, ...typography.body, color: colors.text,
  },
  modalSave: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', marginTop: 20 },
  modalSaveText: { ...typography.bodyBold, color: colors.white },
  modalCancel: { alignItems: 'center', paddingVertical: 12 },
  modalCancelText: { ...typography.caption, color: colors.textMuted },
});
