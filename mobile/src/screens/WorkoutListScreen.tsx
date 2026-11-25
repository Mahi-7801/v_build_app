import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { Text } from '../components/LocalizedText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from '../navigation/RootNavigator';
import { colors } from '../theme/colors';
import { radius, spacing, typography, shadows } from '../theme/theme';
import { Icon, IconName } from '../components/Icon';
import { ExerciseArt } from '../components/ExerciseArt';
import { PlanCard, WorkoutCard } from '../components/WorkoutCard';
import { Section } from '../components/Section';
import { AppHeader } from '../components/AppHeader';
import { PhotoWorkoutCard } from '../components/PhotoWorkoutCard';
import { COVERS } from '../onboarding/coverImages';
import { ScreenEnter } from '../components/ScreenEnter';
import { exploreApi, historyApi, plansApi } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { normalizeCategory, type LevelKey } from '../data/workoutFilters';
import type { WorkoutPlan } from '../types';
import { DiscoverExtras } from '../components/FitnessExtras';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Workouts'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const CATEGORIES = [
  { key: '', label: 'All' },
  { key: 'abs', label: 'Abs' },
  { key: 'chest', label: 'Chest' },
  { key: 'arms', label: 'Arms' },
  { key: 'legs', label: 'Legs' },
  { key: 'shoulder', label: 'Shoulders' },
  { key: 'hiit', label: 'HIIT' },
  { key: 'full_body', label: 'Full body' },
];

const LEVELS: Array<{ key: LevelKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: '1', label: 'Beginner' },
  { key: '2', label: 'Intermediate' },
  { key: '3', label: 'Advanced' },
  { key: 'pro', label: 'PRO' },
];
const LEVEL_NAMES: Record<number, string> = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' };

const FREE_WORKOUT_LIMIT = 20;

/** Quick actions shown by the real app's Training tab. */
const QUICK_ACTIONS: Array<{ label: string; icon: IconName; category: string; level?: 'all' | '1' | '2' | '3' | 'pro' }> = [
  { label: 'Fast workout', icon: 'lightning', category: 'hiit' },
  { label: 'Stretch & Warm Up', icon: 'smile', category: 'stretch' },
  { label: 'Challenge', icon: 'trophy', category: 'full_body' },
  { label: 'Custom', icon: 'dumbbell', category: '' },
];

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export default function WorkoutListScreen() {
  const nav = useNavigation<Nav>();
  const lang = useAppStore((s) => s.lang);
  const profile = useAppStore((s) => s.profile);
  const isPro = useAppStore((s) => !!s.user?.is_pro);
  const settings = useAppStore((s) => s.settings);
  const workoutFilter = useAppStore((s) => s.workoutFilter);
  const setWorkoutFilter = useAppStore((s) => s.setWorkoutFilter);
  const category = workoutFilter.category;
  const level = workoutFilter.level;
  const setCategory = (v: string) => setWorkoutFilter({ category: v });
  const setLevel = (v: LevelKey) => setWorkoutFilter({ level: v });
  const [search, setSearch] = useState('');
  const [allPlans, setAllPlans] = useState<WorkoutPlan[]>([]);
  const [myPlans, setMyPlans] = useState<any[]>([]);
  const [explore, setExplore] = useState<any>(null);
  const [calendarDays, setCalendarDays] = useState<any[]>([]);
  const scrollRef = useRef<any>(null);
  const listRef = useRef<any>(null);
  const stretchRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      // Fetch the full recovered catalogue (136 plans), not just the first page.
      const [{ data }, saved, exp, cal] = await Promise.all([
        plansApi.list({ limit: 200 }),
        plansApi.myPlans().catch(() => ({ data: { plans: [] } })),
        exploreApi.all(lang).catch(() => ({ data: null })),
        historyApi.calendar().catch(() => ({ data: { days: [] } })),
      ]);
      setAllPlans(data.items || []);
      setMyPlans(saved.data?.plans || []);
      if (exp.data) setExplore(exp.data);
      setCalendarDays(cal.data?.days || []);
    } catch { /* ignore */ }
  }, [lang]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const matches = (p: WorkoutPlan, lvl: typeof level) => {
    const q = search.trim().toLowerCase();
    const hay = [p.name, p.code, p.category, p.description, LEVEL_NAMES[Number(p.level)]]
      .filter(Boolean).join(' ').toLowerCase();
    return (!category || normalizeCategory(p.category) === normalizeCategory(category))
      && (!q || hay.includes(q))
      && (lvl === 'all' || (lvl === 'pro' ? !!p.is_pro : Number(p.level) === Number(lvl)));
  };
  const freePlans = allPlans.filter((p) => !p.is_pro);
  const allVisible = isPro ? allPlans : freePlans;
  // Free users get a limited catalogue; PRO unlocks all workouts.
  const visiblePlans = isPro ? allPlans : freePlans.slice(0, FREE_WORKOUT_LIMIT);
  const plans = visiblePlans.filter((p) => matches(p, level));
  const count = (lvl: typeof level) => allVisible.filter((p) => matches(p, lvl)).length;

  // --- Training-tab data: today's plan, week strip and recommendations ----
  const activePlan = myPlans[0] || null;
  const nowDate = new Date();
  const todayIndex = nowDate.getDay();
  const startDay = Math.max(0, DAY_NAMES.indexOf(String(profile.firstDayOfWeek || 'SUNDAY').slice(0, 3).toUpperCase()));
  const todayOffset = (todayIndex - startDay + 7) % 7;
  const weekStart = new Date(nowDate);
  weekStart.setDate(nowDate.getDate() - todayOffset);
  const trainingDays = profile.weeklyDays || 3;
  const doneDates = new Set(calendarDays.filter((d: any) => Number(d.sessions) > 0).map((d: any) => d.activity_date));
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    return {
      key: i,
      name: DAY_NAMES[day.getDay()],
      date: day.getDate(),
      isToday: i === todayOffset,
      isPast: i < todayOffset,
      isTraining: i < trainingDays,
      done: doneDates.has(iso),
    };
  });
  const doneThisWeek = week.filter((d) => d.isTraining && (d.isPast || d.isToday) && d.done).length;
  const planDay = Number(activePlan?.current_day || 0) + 1;
  const planTotal = Number(activePlan?.total_workouts || trainingDays);

  const workouts: any[] = (explore?.workouts || []).filter((w: any) =>
    !!w.name && (isPro || w.lock !== '1_1'));
  // Onboarding answers decide the recommendations shown to a new user.
  const userLevel = Number(settings?.difficulty || 1);
  const forLevel = workouts.filter((w: any) => !w.level || Number(w.level) === userLevel);
  const justForYou = (forLevel.length ? forLevel : workouts).slice(0, 8);
  const stretch = workouts.filter((w: any) => /stretch|warm/i.test(String(w.name || ''))).slice(0, 6);
  const stretchFallback = stretch.length ? stretch : workouts.slice(0, 6);
  const focusAreas = profile.focusAreas?.length
    ? profile.focusAreas
    : ['Abs', 'Chest', 'Arms', 'Legs', 'Shoulders', 'Full Body'];

  const scrollToRef = (target: any) => {
    setTimeout(() => {
      target?.measureLayout(
        scrollRef.current,
        (_x: number, y: number) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true }),
        () => {}
      );
    }, 80);
  };
  const scrollToList = () => scrollToRef(listRef.current);

  const openQuick = (item: typeof QUICK_ACTIONS[number]) => {
    if (item.label === 'Custom') {
      nav.navigate('CustomWorkoutBuilder');
      return;
    }
    if (item.label === 'Stretch & Warm Up') {
      // No plan has a "stretch" category — the Stretch carousel uses the
      // explore catalogue, so jump there instead of applying an empty filter.
      setCategory('');
      setLevel('all');
      setSearch('');
      scrollToRef(stretchRef.current);
      return;
    }
    setCategory(item.category);
    setLevel(item.level || 'all');
    setSearch('');
    scrollToList();
  };

  const getMyPlan = () => {
    if (activePlan) {
      nav.navigate('WorkoutDetail', { planId: activePlan.plan_id || activePlan.id });
      return;
    }
    const beginner = visiblePlans.find((p) => Number(p.level) === 1) || visiblePlans[0];
    if (beginner) {
      nav.navigate('WorkoutDetail', { planId: beginner.id, planCode: beginner.code });
    } else {
      setCategory('');
      setLevel('1');
      setSearch('');
      scrollToList();
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <ScreenEnter>

        {!!myPlans.length && (
          <View style={styles.myPlans}>
            <Text style={styles.sectionTitle}>Your plans ({myPlans.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.myPlanList}>
              {myPlans.map((p: any) => (
                <TouchableOpacity key={p.id} style={styles.myPlan}
                  onPress={() => nav.navigate('WorkoutDetail', { planId: p.plan_id || p.id })}>
                  <Icon name="dumbbell" size={16} color={colors.primary} />
                  <Text style={styles.myPlanName} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.myPlanSub}>Day {p.current_day || 0} · {p.total_workouts || 0} done</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Today card — equivalent to the real app's "Continue my plan" card */}
        <View style={styles.todayCard}>
          <View style={styles.todayHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.todayKicker}>TODAY · {DAY_NAMES[todayIndex]}</Text>
              <Text style={styles.todayTitle} numberOfLines={2}>
                {activePlan?.name || 'Your daily workout plan'}
              </Text>
              <Text style={styles.todaySub}>
                {activePlan
                  ? `Day ${planDay} of ${planTotal} · ${activePlan.completed_days || 0} completed`
                  : `${trainingDays} days a week · ${String(profile.pushupLevel || 'Beginner').replace(/^./, (c) => c.toUpperCase())}`}
              </Text>
            </View>
            <View style={styles.todayArt}>
              <ExerciseArt actionId={plans[0]?.first_action_id} size={78} glyph="◆" />
            </View>
          </View>
          <View style={styles.todayTrack}>
            <View style={[styles.todayTrackFill, { width: `${Math.min(100, (doneThisWeek / Math.max(1, trainingDays)) * 100)}%` }]} />
          </View>
          <TouchableOpacity
            style={styles.todayCta}
            onPress={getMyPlan}
          >
            <Text style={styles.todayCtaText}>{activePlan ? 'Continue my plan' : 'Get my plan'}</Text>
            <Icon name="play" size={13} color={colors.white} />
          </TouchableOpacity>
        </View>

        {/* Compact weekly plan strip — same 7-day structure as the real app */}
        <View style={styles.weekCard}>
          <View style={styles.weekHead}>
            <Text style={styles.weekTitle}>THIS WEEK</Text>
            <Text style={styles.weekDone}>{doneThisWeek}/{trainingDays} done</Text>
          </View>
          <View style={styles.weekDays}>
            {week.map((d) => (
              <View key={d.key} style={styles.weekDayWrap}>
                <View style={[
                  styles.weekTile,
                  d.isToday ? styles.weekTileToday : d.done ? styles.weekTileDone : d.isTraining ? styles.weekTileTraining : styles.weekTileRest,
                ]}>
                  <Text style={[styles.weekDay, d.isToday && styles.weekDayOn]}>{d.name.charAt(0)}</Text>
                  <Text style={[styles.weekDate, d.isToday && styles.weekDayOn]}>{d.date}</Text>
                </View>
                {d.done && <View style={styles.weekCheck}><Icon name="check" size={9} color={colors.white} /></View>}
              </View>
            ))}
          </View>
        </View>

        {/* Quick navigation tiles */}
        <View style={styles.quickRow}>
          {QUICK_ACTIONS.map((item) => (
            <TouchableOpacity key={item.label} style={styles.quickTile} onPress={() => openQuick(item)}>
              <Icon name={item.icon} size={20} color={colors.primary} />
              <Text style={styles.quickLabel} numberOfLines={2}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.hero}>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Train anywhere</Text>
            <Text style={styles.heroSub}>No equipment. Just you and your body.</Text>
          </View>
          <ExerciseArt actionId={plans[0]?.first_action_id} size={118} glyph="◆" />
        </View>

        <View style={styles.searchRow}>
          <Icon name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.search}
            placeholder="Search workouts"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon name="close" size={17} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        {!!search && <Text style={styles.searchResult}>Found {plans.length} workout{plans.length === 1 ? '' : 's'} for “{search}”</Text>}

        {/* Filters first, then consistent recommendation sections */}
        <Text style={styles.chipLabel}>CATEGORY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.key}
              onPress={() => setCategory(c.key)}
              style={[styles.chip, category === c.key && styles.chipActive]}
            >
              <Text style={[styles.chipText, category === c.key && styles.chipTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.chipLabel}>LEVEL</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {(isPro ? LEVELS : LEVELS.filter((l) => l.key !== 'pro')).map((l) => (
            <TouchableOpacity
              key={l.key}
              onPress={() => setLevel(l.key)}
              style={[styles.chip, level === l.key && styles.chipActive]}
            >
              <Text style={[styles.chipText, level === l.key && styles.chipTextActive]}>
                {l.label} ({count(l.key)})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {!!justForYou.length && (
          <Section title="Just For You" subtitle="Picked from your plan answers" style={styles.recoSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
              {justForYou.map((w: any, i: number) => (
                <WorkoutCard key={`jfyu-${i}`} workout={w} index={i}
                  onPress={() => nav.navigate('WorkoutDetail', { workoutId: w.id, planCode: w.planCode || undefined })} />
              ))}
            </ScrollView>
          </Section>
        )}

        <Section title="Body Focus" subtitle="Pick an area, then a level" style={styles.recoSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselChips}>
            {focusAreas.map((area: string) => (
              <TouchableOpacity key={area} style={[styles.focusChip, category === normalizeCategory(area) && styles.chipActive]}
                onPress={() => {
                  setCategory(normalizeCategory(area));
                  setLevel('all');
                  setSearch('');
                }}>
                <Text style={[styles.chipText, category === normalizeCategory(area) && styles.chipTextActive]}>{area}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {focusAreas.some((a: string) => normalizeCategory(a) === category) && (
            <View style={styles.levelDrill}>
              <Text style={styles.chipLabelInner}>LEVEL · {CATEGORIES.find((c) => c.key === category)?.label || category}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carouselChips}>
                {LEVELS.filter((l) => l.key !== 'pro').map((l) => (
                  <TouchableOpacity
                    key={l.key}
                    onPress={() => { setLevel(l.key); scrollToList(); }}
                    style={[styles.chip, level === l.key && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, level === l.key && styles.chipTextActive]}>{l.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </Section>

        {!!stretchFallback.length && (
          <View ref={stretchRef}>
            <Section title="Stretch" subtitle="Recover and loosen up" style={styles.recoSection}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
                {stretchFallback.map((w: any, i: number) => (
                  <WorkoutCard key={`stretch-${i}`} workout={w} index={i + 2}
                    onPress={() => nav.navigate('WorkoutDetail', { workoutId: w.id, planCode: w.planCode || undefined })} />
                ))}
              </ScrollView>
            </Section>
          </View>
        )}

        <View ref={listRef} style={styles.list}>
          <Text style={styles.sectionTitle}>All workouts ({plans.length})</Text>
          {plans.map((p, i) => (
            <PhotoWorkoutCard
              key={p.id}
              title={p.name || 'Workout'}
              minutes={p.duration_sec ? `${Math.round(p.duration_sec / 60)} min` : undefined}
              level={LEVEL_NAMES[Number(p.level)] || 'Beginner'}
              price={p.price_cents ? `$${(p.price_cents / 100).toFixed(2)}` : undefined}
              pro={!!p.is_pro && !p.price_cents}
              image={COVERS[i % COVERS.length]}
              onPress={() => nav.navigate('WorkoutDetail', { planId: p.id, planCode: p.code })}
            />
          ))}
          {!plans.length && (
            <View style={styles.empty}>
              <Icon name="search" size={34} color={colors.textMuted} />
              <Text style={styles.emptyText}>No workouts found</Text>
            </View>
          )}
        </View>

        {!isPro && freePlans.length > FREE_WORKOUT_LIMIT && (
          <TouchableOpacity style={styles.moreWorkouts} onPress={() => nav.navigate('Pro')}>
            <Icon name="crown" size={18} color={colors.pro} />
            <View style={{ flex: 1 }}>
              <Text style={styles.moreTitle}>Want more workouts?</Text>
              <Text style={styles.moreSub}>Unlock all {allPlans.length} workouts with PRO</Text>
            </View>
            <Icon name="chevron" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        <DiscoverExtras />
        </ScreenEnter>
      </ScrollView>
    </SafeAreaView>
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
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    backgroundColor: '#E8F0FF', borderRadius: radius.xl,
    padding: spacing.md, overflow: 'hidden',
  },
  heroText: { flex: 1 },
  heroTitle: { ...typography.h3, color: colors.text },
  heroSub: { ...typography.caption, color: colors.textSecondary, marginTop: 5, lineHeight: 17 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, height: 48, ...shadows.card,
  },
  search: { flex: 1, ...typography.body, color: colors.text },
  searchResult: { ...typography.tiny, color: colors.primary, fontWeight: '800', marginTop: 8, marginHorizontal: spacing.lg },
  myPlans: { marginHorizontal: spacing.lg, marginTop: spacing.lg },
  myPlanList: { gap: spacing.sm },
  myPlan: {
    width: 150, backgroundColor: colors.white, borderRadius: radius.md,
    padding: spacing.md, gap: 3, ...shadows.card,
  },
  myPlanName: { ...typography.caption, color: colors.text, fontWeight: '800' },
  myPlanSub: { ...typography.tiny, color: colors.textMuted },
  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  chipLabel: {
    ...typography.tiny, color: colors.textSecondary, fontWeight: '900',
    letterSpacing: 1, marginHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: -spacing.sm,
  },
  chipLabelInner: {
    ...typography.tiny, color: colors.textSecondary, fontWeight: '900',
    letterSpacing: 1, marginBottom: 6,
  },
  levelDrill: { marginTop: spacing.sm },
  chips: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, height: 34, borderRadius: radius.pill,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  chipTextActive: { color: colors.white },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 20 },
  moreWorkouts: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginHorizontal: spacing.lg, marginTop: spacing.xl,
    backgroundColor: '#FFF8E8', borderRadius: radius.xl,
    borderWidth: 1, borderColor: '#FFE3A3', padding: spacing.md,
  },
  moreTitle: { ...typography.bodyBold, color: colors.text },
  moreSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: spacing.md },
  emptyText: { ...typography.body, color: colors.textMuted },

  // Training-tab additions
  todayCard: {
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
    backgroundColor: colors.white, borderRadius: radius.xl,
    padding: spacing.lg, ...shadows.card,
  },
  todayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  todayKicker: { ...typography.tiny, color: colors.primary, fontWeight: '900', letterSpacing: 1.1 },
  todayTitle: { ...typography.h3, color: colors.text, marginTop: 5 },
  todaySub: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  todayArt: {
    width: 88, height: 88, borderRadius: radius.lg,
    backgroundColor: '#EAF0FF', alignItems: 'center', justifyContent: 'center',
  },
  todayTrack: { height: 6, borderRadius: 3, backgroundColor: '#EDF0F6', marginTop: 16, overflow: 'hidden' },
  todayTrackFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  todayCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 11, marginTop: 16,
  },
  todayCtaText: { ...typography.caption, color: colors.white, fontWeight: '800' },

  weekCard: {
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, ...shadows.card,
  },
  weekHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  weekTitle: { ...typography.tiny, color: colors.text, fontWeight: '900', letterSpacing: 1 },
  weekDone: { ...typography.tiny, color: colors.primary, fontWeight: '800' },
  weekDays: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  weekDayWrap: { flex: 1, alignItems: 'center' },
  weekTile: {
    width: 38, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  weekTileToday: { backgroundColor: colors.primary },
  weekTileDone: { backgroundColor: '#EAF0FF' },
  weekTileTraining: { backgroundColor: '#F0F4FF' },
  weekTileRest: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border },
  weekDay: { ...typography.tiny, color: colors.textMuted, fontWeight: '800' },
  weekDate: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 2 },
  weekDayOn: { color: colors.white },
  weekCheck: {
    position: 'absolute', top: -3, right: 2,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#2ED47A', alignItems: 'center', justifyContent: 'center',
  },

  quickRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  quickTile: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.white, borderRadius: radius.lg,
    paddingVertical: 12, paddingHorizontal: 4, minHeight: 74, ...shadows.card,
  },
  quickLabel: { ...typography.tiny, color: colors.text, fontWeight: '800', textAlign: 'center' },

  recoSection: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  carousel: { paddingHorizontal: 0, paddingTop: 2, paddingBottom: 6 },
  carouselChips: { paddingHorizontal: 0, gap: spacing.sm, paddingTop: 2, paddingBottom: 4 },
  focusChip: {
    paddingHorizontal: spacing.md, height: 34, borderRadius: radius.pill,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
});
