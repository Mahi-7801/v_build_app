import React, { useEffect, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, TextInput, Linking, Alert, Share, Platform,
} from 'react-native';
import { Text } from './LocalizedText';
import { Icon, IconName } from './Icon';
import { colors } from '../theme/colors';
import { radius, spacing, typography, shadows } from '../theme/theme';
import { useNavigation } from '@react-navigation/native';
import { useAppStore } from '../store/useAppStore';
import { CalendarModal } from './CalendarModal';
import { exploreApi, plansApi } from '../api/client';
import {
  BODY_FOCUS_AREAS, BODY_FOCUS_WORKOUTS, CHALLENGE_FILTERS, CHALLENGES,
  CHALLENGE_TABS, DISCOVER_SECTIONS, JUST_FOR_YOU, POPULAR_GOALS, QUICK_ACTIONS,
  RECOMMENDED, STRETCH_WORKOUTS, type SampleWorkout,
} from '../data/fitnessCatalog';
import { normalizeCategory } from '../data/workoutFilters';

let catalogMatchCache: { workouts: any[]; plans: any[]; at: number; ver: number } | null = null;
async function ensureCatalogLookup(ver: number, lang: string) {
  if (catalogMatchCache && catalogMatchCache.ver === ver && Date.now() - catalogMatchCache.at < 120_000) {
    return catalogMatchCache;
  }
  const [expRes, planRes] = await Promise.allSettled([
    exploreApi.all(lang),
    plansApi.list({ limit: 250 }),
  ]);
  const workouts = expRes.status === 'fulfilled' ? (expRes.value.data?.workouts || []) : [];
  const plans = planRes.status === 'fulfilled' ? (planRes.value.data?.items || []) : [];
  catalogMatchCache = { workouts, plans, at: Date.now(), ver };
  return catalogMatchCache;
}

const normTitle = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function openWorkoutOrCatalog(nav: any, title: string, fallbackCategory?: string) {
  try {
    const { lang, catalogVersion } = useAppStore.getState();
    const { workouts, plans } = await ensureCatalogLookup(catalogVersion, lang);
    const needle = normTitle(title);
    const matchW = workouts.find((w: any) => normTitle(w.name) === needle)
      || workouts.find((w: any) => normTitle(w.name).includes(needle) || needle.includes(normTitle(w.name)));
    if (matchW) {
      nav.navigate('WorkoutDetail', { workoutId: matchW.id, planCode: matchW.planCode || undefined });
      return;
    }
    const matchP = plans.find((p: any) => normTitle(p.name) === needle)
      || plans.find((p: any) => normTitle(p.name).includes(needle) || needle.includes(normTitle(p.name)));
    if (matchP) {
      nav.navigate('WorkoutDetail', { planId: matchP.id, planCode: matchP.code });
      return;
    }
  } catch { /* fallback to workouts tab */ }
  openWorkouts(nav, fallbackCategory);
}

const openWorkouts = (nav: any, category?: string) => {
  if (category !== undefined) {
    useAppStore.getState().setWorkoutFilter({ category: normalizeCategory(category), level: 'all' });
  }
  nav.navigate('Workouts');
};

/* ------------------------------------------------------------------------ */
/* Shared bits                                                               */
/* ------------------------------------------------------------------------ */

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function SectionTitle({ title, subtitle, action, onAction }: {
  title: string; subtitle?: string; action?: string; onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHead}>
      <View>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.sectionSub}>{subtitle}</Text>}
      </View>
      {!!action && <TouchableOpacity onPress={onAction}><Text style={styles.sectionAction}>{action}</Text></TouchableOpacity>}
    </View>
  );
}

function Pills({ items, selected, onSelect }: {
  items: readonly string[]; selected: string; onSelect: (v: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
      {items.map((item) => (
        <TouchableOpacity key={item} onPress={() => onSelect(item)}
          style={[styles.pill, selected === item && styles.pillActive]}>
          <Text style={[styles.pillText, selected === item && styles.pillTextActive]}>{item}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function WorkoutRows({ items, onPress }: { items: SampleWorkout[]; onPress: (item: SampleWorkout) => void }) {
  if (!items.length) {
    return <Text style={styles.emptyInline}>No workouts match your search.</Text>;
  }
  return (
    <View style={styles.rows}>
      {items.map((item, i) => (
        <TouchableOpacity key={`${item.name}-${i}`} onPress={() => onPress(item)} style={styles.row}>
          <View style={[styles.rowArt, { backgroundColor: i % 2 ? '#FFEDE4' : '#E8F0FF' }]}>
            <Icon name="dumbbell" size={19} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.rowMeta}>{item.meta}</Text>
          </View>
          {!!item.tag && <View style={styles.tag}><Text style={styles.tagText}>{item.tag}</Text></View>}
          <Icon name="chevron" size={15} color={colors.textMuted} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------------ */
/* 1. Training home additions                                                */
/* ------------------------------------------------------------------------ */

export function TrainingHomeExtras({ streak = 0 }: { streak?: number }) {
  const nav = useNavigation<any>();
  const profile = useAppStore((s) => s.profile);
  const updateProfile = useAppStore((s) => s.updateProfile);
  const [query, setQuery] = useState('');
  const [calOpen, setCalOpen] = useState(false);
  const weeklyDays = profile.weeklyDays || 3;
  const setWeeklyDays = (next: number) => {
    const clamped = Math.min(7, Math.max(1, next));
    updateProfile({ weeklyDays: clamped }).catch(() => {});
  };
  const [challengeTab, setChallengeTab] = useState<string>('All');
  const [challengeFilter, setChallengeFilter] = useState<string>('Plank');
  const [area, setArea] = useState<string>('Arm');
  const { lang, catalogVersion } = useAppStore();

  useEffect(() => {
    ensureCatalogLookup(catalogVersion, lang).catch(() => {});
  }, [catalogVersion, lang]);

  const match = (items: SampleWorkout[]) => items.filter((it) =>
    !query.trim() || `${it.name} ${it.meta} ${it.tag || ''}`.toLowerCase().includes(query.trim().toLowerCase()));

  const featured = CHALLENGES.find((c) =>
    (challengeTab === 'All' || c.tab === challengeTab) && c.filter === challengeFilter)
    || CHALLENGES.find((c) => (challengeTab === 'All' || c.tab === challengeTab))
    || CHALLENGES[0];

  return (
    <View style={styles.wrap}>
      {/* Top header bar */}
      <View style={styles.headerBar}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Icon name="dumbbell" size={19} color={colors.white} /></View>
          <View>
            <Text style={styles.brandName}>HOME WORKOUT</Text>
            <Text style={styles.brandSub}>NO EQUIPMENT</Text>
          </View>
        </View>
        <View style={styles.headerBadges}>
          <TouchableOpacity style={styles.badge} onPress={() => nav.navigate('Progress')}>
            <Icon name="flame" size={13} color="#FF8A29" />
            <Text style={styles.badgeText}>{streak}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.badge, styles.badgePlan]} onPress={() => openWorkouts(nav)}>
            <Icon name="calendar" size={13} color={colors.primary} />
            <Text style={[styles.badgeText, { color: colors.primary }]}>Plan</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 1. Search */}
      <View style={styles.searchBar}>
        <Icon name="search" size={18} color={colors.textMuted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search workouts, plans, exercises"
          placeholderTextColor={colors.textMuted} style={styles.searchInput} returnKeyType="search" />
        {!!query && <TouchableOpacity onPress={() => setQuery('')}><Icon name="close" size={16} color={colors.textMuted} /></TouchableOpacity>}
      </View>
      {!!query && <Text style={styles.searchCount}>Results across workouts, plans and exercises</Text>}

      {/* 2. Weekly goal */}
      <TouchableOpacity style={styles.weeklyCard} onPress={() => setCalOpen(true)} activeOpacity={0.9}>
        <View style={styles.weeklyLeft}>
          <View style={styles.weeklyIcon}><Icon name="target" size={21} color={colors.white} /></View>
          <View>
            <Text style={styles.weeklyKicker}>WEEKLY GOAL</Text>
            <Text style={styles.weeklyTitle}>{weeklyDays} days of training</Text>
            <Text style={styles.weeklySub}>Tap to view & edit your schedule</Text>
          </View>
        </View>
        <View style={styles.stepper}>
          <TouchableOpacity onPress={() => setWeeklyDays(weeklyDays - 1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="minus" size={15} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.stepperValue}>{weeklyDays}</Text>
          <TouchableOpacity onPress={() => setWeeklyDays(weeklyDays + 1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="plus" size={15} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* 3. Challenge */}
      <View style={styles.block}>
        <SectionTitle title="Challenge" subtitle="Pick a goal and start day 1" />
        <Pills items={CHALLENGE_TABS} selected={challengeTab} onSelect={setChallengeTab} />
        <Pills items={CHALLENGE_FILTERS} selected={challengeFilter} onSelect={setChallengeFilter} />
        <Card style={styles.challengeCard}>
          <View style={styles.challengeTop}>
            <Text style={styles.challengeCategory}>{featured.category}</Text>
            <View style={styles.durationPill}><Icon name="clock" size={11} color={colors.white} /><Text style={styles.durationText}>{featured.duration}</Text></View>
          </View>
          <Text style={styles.challengeTitle}>{featured.title}</Text>
          <Text style={styles.challengeSub}>Build the habit, one day at a time.</Text>
          <TouchableOpacity style={styles.challengeCta} onPress={() => openWorkoutOrCatalog(nav, featured.title, challengeFilter)}>
            <Text style={styles.challengeCtaText}>START DAY 1</Text>
            <Icon name="chevron" size={15} color={colors.white} />
          </TouchableOpacity>
        </Card>
      </View>

      {/* 4. Body focus */}
      <View style={styles.block}>
        <SectionTitle title="Body Focus" subtitle="Choose a muscle group" />
        <Pills items={BODY_FOCUS_AREAS} selected={area} onSelect={setArea} />
        <WorkoutRows items={match(BODY_FOCUS_WORKOUTS[area] || [])} onPress={(it) => openWorkoutOrCatalog(nav, it.name, area)} />
      </View>

      {/* 5. Quick actions */}
      <View style={styles.block}>
        <SectionTitle title="Quick Actions" subtitle="Jump straight into a workout" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
          {QUICK_ACTIONS.map((label, i) => (
            <TouchableOpacity key={label} onPress={() => openWorkouts(nav, label === 'Stretch' ? 'stretch' : label === 'Burn Fat' ? 'hiit' : '')} style={styles.quickChip}>
              <Icon name={(['flame', 'lightning', 'heartPulse', 'smile', 'clock', 'star', 'dumbbell', 'trophy', 'dumbbell'] as IconName[])[i] || 'dumbbell'} size={17} color={colors.primary} />
              <Text style={styles.quickChipText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* 6. Custom workout */}
      <View style={styles.block}>
        <SectionTitle title="Custom Workout" subtitle="Build your own routine" />
        <Card style={styles.customCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.customTitle}>Create your own</Text>
            <Text style={styles.customSub}>Pick exercises, order them and save.</Text>
          </View>
          <TouchableOpacity style={styles.goButton} onPress={() => nav.navigate('CustomWorkoutBuilder')}>
            <Text style={styles.goText}>Go</Text>
          </TouchableOpacity>
        </Card>
      </View>

      {/* 7-9. Workout collections */}
      <WorkoutCollection title="Recommended" subtitle="Handpicked for your goals" items={match(RECOMMENDED)} fallbackCategory="full_body" nav={nav} />
      <WorkoutCollection title="Just For You" subtitle="Personalized from your answers" items={match(JUST_FOR_YOU)} fallbackCategory="" nav={nav} />
      <WorkoutCollection title="Stretch & Warm up" subtitle="Move better, recover faster" items={match(STRETCH_WORKOUTS)} fallbackCategory="stretch" nav={nav} />

      {/* 10. Popular goals */}
      <View style={styles.block}>
        <SectionTitle title="Popular Goals" subtitle="What are you working towards?" />
        <View style={styles.goalRow}>
          {POPULAR_GOALS.map((g) => (
            <TouchableOpacity key={g.title} onPress={() => openWorkouts(nav)} style={[styles.goalCard, { backgroundColor: g.tint }]}>
              <Icon name={g.icon} size={22} color={colors.primary} />
              <Text style={styles.goalTitle}>{g.title}</Text>
              <Text style={styles.goalSub} numberOfLines={2}>{g.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 11. Explore more */}
      <TouchableOpacity style={styles.exploreBtn} onPress={() => openWorkouts(nav)}>
        <Icon name="search" size={17} color={colors.primary} />
        <Text style={styles.exploreText}>Explore More Workouts</Text>
        <Icon name="chevron" size={16} color={colors.primary} />
      </TouchableOpacity>

      <CalendarModal visible={calOpen} onClose={() => setCalOpen(false)} weeklyDays={weeklyDays} firstDayOfWeek={profile.firstDayOfWeek} />
    </View>
  );
}

function WorkoutCollection({ title, subtitle, items, fallbackCategory, nav }: {
  title: string; subtitle: string; items: SampleWorkout[]; fallbackCategory: string; nav: any;
}) {
  return (
    <View style={styles.block}>
      <SectionTitle title={title} subtitle={subtitle} action="See all" onAction={() => openWorkouts(nav, fallbackCategory)} />
      <WorkoutRows items={items} onPress={(it) => openWorkoutOrCatalog(nav, it.name, fallbackCategory)} />
    </View>
  );
}

/* ------------------------------------------------------------------------ */
/* 2. Discover additions                                                     */
/* ------------------------------------------------------------------------ */

export function DiscoverExtras() {
  const nav = useNavigation<any>();
  const { lang, catalogVersion } = useAppStore();
  useEffect(() => {
    ensureCatalogLookup(catalogVersion, lang).catch(() => {});
  }, [catalogVersion, lang]);

  const sectionCategory = (title: string) => (
    /stretch/i.test(title) ? 'stretch'
      : /challenge/i.test(title) ? 'challenge'
      : /fast/i.test(title) ? 'hiit'
      : ''
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.discoverHead}>
        <Text style={styles.discoverKicker}>EXPLORE</Text>
        <Text style={styles.discoverTitle}>Discover</Text>
        <Text style={styles.discoverSub}>Fresh workouts picked for every goal and day.</Text>
      </View>
      {DISCOVER_SECTIONS.map((section) => (
        <View key={section.title} style={styles.block}>
          <SectionTitle title={section.title} subtitle={section.subtitle} action="See all" onAction={() => openWorkouts(nav, sectionCategory(section.title))} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.discoverCarousel}>
            {section.items.map((item, i) => (
              <TouchableOpacity key={`${section.title}-${i}`} onPress={() => openWorkoutOrCatalog(nav, item.name, sectionCategory(section.title))} style={styles.discoverCard}>
                <View style={[styles.discoverArt, { backgroundColor: i % 2 ? '#FFEDE4' : '#E8F0FF' }]}>
                  <Icon name={i % 3 === 0 ? 'flame' : 'dumbbell'} size={26} color={colors.primary} />
                </View>
                <Text style={styles.discoverCardTitle} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.discoverCardMeta}>{item.meta}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------------ */
/* 3. Report additions - BMI gauge                                           */
/* ------------------------------------------------------------------------ */

const TICKS = ['15', '16', '18.5', '25', '30', '35', '40'];
const SEGMENTS = ['#60A5FA', '#34D399', '#FBBF24', '#FB923C', '#F87171', '#DC2626'];

export function BmiGauge({ value }: { value: number }) {
  const clamped = Number.isFinite(value) && value > 0 ? Math.min(40, Math.max(15, value)) : 0;
  const pct = clamped ? ((clamped - 15) / 25) * 100 : 0;
  return (
    <View style={styles.gaugeWrap}>
      {!!clamped && (
        <View style={styles.gaugePointer} pointerEvents="none">
          <View style={[styles.gaugeNeedle, { left: `${pct}%` }]} />
        </View>
      )}
      <View style={styles.gaugeBar}>
        {SEGMENTS.map((c, i) => <View key={i} style={[styles.gaugeSeg, { backgroundColor: c }]} />)}
      </View>
      <View style={styles.gaugeTicks}>
        {TICKS.map((t) => <Text key={t} style={styles.gaugeTick}>{t}</Text>)}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------------ */
/* 4. Settings additions                                                     */
/* ------------------------------------------------------------------------ */

const SETTINGS_GROUP_1: Array<{ label: string; icon: IconName; route?: string; proOnly?: boolean }> = [
  { label: 'Workout settings', icon: 'dumbbell', route: 'WorkoutSettings' },
  { label: 'General settings', icon: 'settings', route: 'GeneralSettings' },
  { label: 'Voice options (TTS)', icon: 'bell', route: 'VoiceOptions', proOnly: true },
  { label: 'Suggest other features', icon: 'star', route: 'SuggestFeatures' },
  { label: 'Language options (Default)', icon: 'info', route: 'GeneralSettings', proOnly: true },
  { label: 'Sync to Health Connect', icon: 'heartPulse', route: 'GeneralSettings', proOnly: true },
];
const SETTINGS_GROUP_2: Array<{ label: string; icon: IconName; route?: string; proOnly?: boolean }> = [
  { label: 'Share with friends', icon: 'share' },
  { label: 'Rate us', icon: 'star' },
  { label: 'Feedback', icon: 'info' },
  { label: 'Remove Ads', icon: 'crown', route: 'Pro', proOnly: true },
];

export function SettingsExtras() {
  const nav = useNavigation<any>();
  const user = useAppStore((s) => s.user);
  const supportEmail = useAppStore((s) => s.supportEmail) || 'support@vbuild.app';
  const isPro = !!user?.is_pro;
  const openMail = async (subject: string, body: string) => {
    const url = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Feedback', `Open your mail app and write to ${supportEmail}`);
    }
  };
  const share = async () => {
    try {
      if (Share && typeof Share.share === 'function') {
        await Share.share({ message: 'Try Home Workout - no equipment needed! https://play.google.com/store/apps/details?id=homeworkout.homeworkouts.noequipment' });
        return;
      }
    } catch { /* fall back to email */ }
    await openMail('Try Home Workout', 'Try Home Workout - no equipment needed!');
  };
  const rate = async () => {
    const url = Platform.OS === 'ios'
      ? 'https://apps.apple.com/app/home-workout/id1170884327'
      : 'https://play.google.com/store/apps/details?id=homeworkout.homeworkouts.noequipment';
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Rate us', 'Open the app store and search for Home Workout.');
    }
  };
  const handle = (item: { label: string; route?: string }) => {
    if (item.route) nav.navigate(item.route);
    else if (item.label === 'Share with friends') share();
    else if (item.label === 'Rate us') rate();
    else if (item.label === 'Feedback') openMail('Home Workout feedback', 'Hello,\n\nI would like to see:\n');
  };
  return (
    <View style={styles.wrap}>
      <View style={styles.settingsGroup}>
        <Text style={styles.settingsGroupTitle}>MORE SETTINGS</Text>
        <View style={styles.settingsCard}>
          {SETTINGS_GROUP_1.map((item) => {
            const locked = !!item.proOnly && !isPro;
            return (
              <TouchableOpacity
                key={item.label}
                style={styles.settingsRow}
                onPress={() => locked ? nav.navigate('Pro') : item.route && nav.navigate(item.route)}
              >
                <View style={styles.settingsIcon}>
                  <Icon name={locked ? 'lock' : item.icon} size={17} color={locked ? colors.textMuted : colors.primary} />
                </View>
                <Text style={[styles.settingsLabel, locked && styles.settingsLabelLocked]}>{item.label}</Text>
                {locked
                  ? <View style={styles.proMini}><Text style={styles.proMiniText}>PRO</Text></View>
                  : <Icon name="chevron" size={15} color={colors.textMuted} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View style={styles.settingsGroup}>
        <Text style={styles.settingsGroupTitle}>SUPPORT</Text>
        <View style={styles.settingsCard}>
          {SETTINGS_GROUP_2.map((item) => {
            const locked = !!item.proOnly && !isPro;
            return (
              <TouchableOpacity
                key={item.label}
                style={styles.settingsRow}
                onPress={() => locked ? nav.navigate('Pro') : handle(item)}
              >
                <View style={styles.settingsIcon}>
                  <Icon name={locked ? 'lock' : item.icon} size={17} color={locked ? colors.textMuted : colors.primary} />
                </View>
                <Text style={[styles.settingsLabel, locked && styles.settingsLabelLocked]}>{item.label}</Text>
                {locked
                  ? <View style={styles.proMini}><Text style={styles.proMiniText}>PRO</Text></View>
                  : <Icon name="chevron" size={15} color={colors.textMuted} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------------ */

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.lg },

  headerBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, marginTop: spacing.sm,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  brandName: { ...typography.bodyBold, color: colors.text, letterSpacing: 0.6 },
  brandSub: { ...typography.tiny, color: colors.textMuted, letterSpacing: 1.1, marginTop: 1 },
  headerBadges: { flexDirection: 'row', gap: 8 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFF3E6', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6,
  },
  badgePlan: { backgroundColor: '#EAF0FF' },
  badgeText: { ...typography.tiny, color: '#B45309', fontWeight: '900' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, height: 46, ...shadows.card,
  },
  searchInput: { flex: 1, ...typography.caption, color: colors.text },
  searchCount: { ...typography.tiny, color: colors.primary, marginHorizontal: spacing.lg, marginTop: 8, fontWeight: '800' },

  weeklyCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.white,
    borderRadius: radius.xl, padding: spacing.md, ...shadows.card,
  },
  weeklyLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  weeklyIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  weeklyKicker: { ...typography.tiny, color: colors.primary, fontWeight: '900', letterSpacing: 1 },
  weeklyTitle: { ...typography.bodyBold, color: colors.text, marginTop: 2 },
  weeklySub: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  stepper: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: colors.canvas, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6,
  },
  stepperValue: { ...typography.bodyBold, color: colors.text, minWidth: 12, textAlign: 'center' },

  block: { marginTop: spacing.xl },
  sectionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.h3, color: colors.text },
  sectionSub: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  sectionAction: { ...typography.caption, color: colors.primary, fontWeight: '800' },
  card: { backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, marginHorizontal: spacing.lg, ...shadows.card },

  pills: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  pill: {
    paddingHorizontal: spacing.md, height: 34, borderRadius: radius.pill,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  pillTextActive: { color: colors.white },

  challengeCard: { marginTop: spacing.sm, backgroundColor: colors.dark, borderWidth: 0 },
  challengeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  challengeCategory: { ...typography.tiny, color: '#A9C0FF', fontWeight: '900', letterSpacing: 1.2 },
  durationPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  durationText: { ...typography.tiny, color: colors.white, fontWeight: '800' },
  challengeTitle: { color: colors.white, fontSize: 24, fontWeight: '900', marginTop: 12, letterSpacing: 0.4 },
  challengeSub: { color: 'rgba(255,255,255,0.68)', ...typography.caption, marginTop: 6 },
  challengeCta: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10, marginTop: 18 },
  challengeCtaText: { ...typography.caption, color: colors.white, fontWeight: '900', letterSpacing: 0.7 },

  rows: { marginHorizontal: spacing.lg },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.sm, marginBottom: spacing.sm, ...shadows.card,
  },
  rowArt: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { ...typography.caption, color: colors.text, fontWeight: '800' },
  rowMeta: { ...typography.tiny, color: colors.textSecondary, marginTop: 3 },
  tag: { backgroundColor: '#EAF0FF', borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 3 },
  tagText: { ...typography.tiny, color: colors.primary, fontWeight: '800' },
  emptyInline: { ...typography.caption, color: colors.textMuted, marginHorizontal: spacing.lg },

  quickRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: 4 },
  quickChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.white, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, height: 38,
  },
  quickChipText: { ...typography.caption, color: colors.text, fontWeight: '700' },

  customCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  customTitle: { ...typography.h3, color: colors.text },
  customSub: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  goButton: {
    width: 66, height: 66, borderRadius: 33,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  goText: { color: colors.white, fontSize: 17, fontWeight: '900' },

  goalRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  goalCard: { flex: 1, borderRadius: radius.xl, padding: spacing.md, minHeight: 110, gap: 6, ...shadows.card },
  goalTitle: { ...typography.caption, color: colors.text, fontWeight: '900', marginTop: 4 },
  goalSub: { ...typography.tiny, color: colors.textSecondary },

  exploreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: spacing.lg, marginTop: spacing.xl, height: 50,
    backgroundColor: colors.white, borderRadius: radius.lg,
    borderWidth: 1.5, borderColor: colors.primary,
  },
  exploreText: { ...typography.bodyBold, color: colors.primary },

  discoverHead: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  discoverKicker: { ...typography.tiny, color: colors.primary, fontWeight: '900', letterSpacing: 1.4 },
  discoverTitle: { ...typography.h1, color: colors.text, marginTop: 4 },
  discoverSub: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  discoverCarousel: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: 4 },
  discoverCard: { width: 152, backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.sm, ...shadows.card },
  discoverArt: { height: 104, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  discoverCardTitle: { ...typography.caption, color: colors.text, fontWeight: '800', minHeight: 34 },
  discoverCardMeta: { ...typography.tiny, color: colors.textMuted, marginTop: 3 },

  gaugeWrap: { position: 'relative', paddingTop: 14 },
  gaugePointer: { position: 'absolute', top: 0, left: 0, right: 0, height: 18 },
  gaugeNeedle: {
    position: 'absolute', top: 0, width: 2, height: 12,
    backgroundColor: colors.text, borderRadius: 1, transform: [{ translateX: -1 }],
  },
  gaugeBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  gaugeSeg: { flex: 1 },
  gaugeTicks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  gaugeTick: { ...typography.tiny, color: colors.textMuted, fontSize: 9 },

  settingsGroup: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  settingsGroupTitle: { ...typography.caption, color: colors.textSecondary, fontWeight: '800', letterSpacing: 1, marginBottom: spacing.sm, marginLeft: 4 },
  settingsCard: { backgroundColor: colors.white, borderRadius: radius.xl, overflow: 'hidden', ...shadows.card },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
  settingsIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#EDF3FF', alignItems: 'center', justifyContent: 'center' },
  settingsLabel: { flex: 1, ...typography.caption, color: colors.text, fontWeight: '700' },
  settingsLabelLocked: { color: colors.textMuted },
  proMini: { backgroundColor: colors.pro, borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 3 },
  proMiniText: { fontSize: 9, fontWeight: '900', color: '#7A4B00', letterSpacing: 0.5 },
});
