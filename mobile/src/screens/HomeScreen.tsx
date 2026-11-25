import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Pressable, RefreshControl } from 'react-native';
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
import { WorkoutCard } from '../components/WorkoutCard';
import { Section } from '../components/Section';
import { exploreApi, quotesApi, usersApi } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { normalizeCategory } from '../data/workoutFilters';
import { label } from '../i18n/labels';
import { AppHeader } from '../components/AppHeader';
import { PhotoWorkoutCard } from '../components/PhotoWorkoutCard';
import { COVERS } from '../onboarding/coverImages';
import { ScreenEnter } from '../components/ScreenEnter';
import { GradientBox } from '../onboarding/design';
import { CalendarModal } from '../components/CalendarModal';
import { ChipInfoModal, type ChipInfo } from '../components/ChipInfoModal';
import { formatPoints } from '../points';
import type { Dashboard } from '../types';
import { TrainingHomeExtras } from '../components/FitnessExtras';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Home'>,
  NativeStackNavigationProp<RootStackParamList>
>;

/** Exercises suggested for each focus area selected during onboarding. */
const FOCUS_EXERCISES: Record<string, string[]> = {
  'Full Body': ['Push-ups', 'Bodyweight Squats', 'Plank', 'Jumping Jacks'],
  Arm: ['Push-ups', 'Triceps Dips', 'Arm Circles', 'Plank Shoulder Taps'],
  Chest: ['Push-ups', 'Incline Push-ups', 'Wide Arm Push-ups', 'Chest Slaps'],
  Abs: ['Crunches', 'Leg Raises', 'Plank', 'Bicycle Crunches'],
  Leg: ['Bodyweight Squats', 'Lunges', 'Wall Sit', 'Calf Raises'],
};
const REPS: Record<string, string> = {
  beginner: '8–12 reps', intermediate: '15–20 reps', advanced: '25+ reps',
};

// Module-level caches keep repeat tab switches instant and avoid duplicate
// network requests on first mount.
const CACHE_TTL = 5 * 60 * 1000;
let exploreCache: { data: any; at: number } | null = null;
let dashboardCache: { data: Dashboard; at: number } | null = null;
let quoteCache: { text: string; at: number } | null = null;
let lastLang = '';

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const { user, profile, lang, quote, setQuote, setWorkoutFilter } = useAppStore();
  const [explore, setExplore] = useState<any>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [chipInfo, setChipInfo] = useState<ChipInfo | null>(null);

  const load = useCallback(async () => {
    // Cached content is language-specific — drop it when the user switches language.
    if (lastLang !== lang) {
      exploreCache = null;
      quoteCache = null;
      lastLang = lang;
    }
    const now = Date.now();
    try {
      // Show cached content synchronously first so the screen never blocks.
      if (exploreCache) setExplore(exploreCache.data);
      if (dashboardCache) setDashboard(dashboardCache.data);
      if (quoteCache) setQuote(quoteCache.text);

      const tasks: Promise<any>[] = [];
      if (!exploreCache || now - exploreCache.at > CACHE_TTL) {
        tasks.push(exploreApi.all(lang).then((res) => {
          exploreCache = { data: res.data, at: Date.now() };
          setExplore(res.data);
        }).catch(() => { }));
      }
      if (!dashboardCache || now - dashboardCache.at > CACHE_TTL) {
        tasks.push(usersApi.dashboard().then((res) => {
          dashboardCache = { data: res.data, at: Date.now() };
          setDashboard(res.data);
        }).catch(() => { }));
      }
      if (!quoteCache || now - quoteCache.at > CACHE_TTL) {
        tasks.push(quotesApi.random(lang).then((res) => {
          if (res.data?.quote) {
            quoteCache = { text: res.data.quote.text, at: Date.now() };
            setQuote(res.data.quote.text);
          }
        }).catch(() => { }));
      }
      await Promise.all(tasks);
    } catch { /* keep cached state */ }
    finally { setRefreshing(false); }
  }, [lang, setQuote]);

  // Only focus drives loading; the old duplicate useEffect caused two fetches.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const hour = new Date().getHours();
  const shuffleQuote = async () => {
    if (quoteLoading) return;
    setQuoteLoading(true);
    try {
      const q = await quotesApi.random(lang);
      if (q.data?.quote) setQuote(q.data.quote.text);
    } catch { /* keep current quote */ }
    finally { setQuoteLoading(false); }
  };

  // Real-time week based on the device date + the user's saved start day.
  const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const nowDate = new Date();
  const todayIndex = nowDate.getDay();
  const startDay = Math.max(0, DAY_NAMES.indexOf(String(profile.firstDayOfWeek || 'SUNDAY').slice(0, 3).toUpperCase()));
  const todayOffset = (todayIndex - startDay + 7) % 7;
  const weekStart = new Date(nowDate);
  weekStart.setDate(nowDate.getDate() - todayOffset);
  const trainingDays = profile.weeklyDays || 3;
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    return {
      key: i,
      name: DAY_NAMES[day.getDay()],
      date: day.getDate(),
      isToday: i === todayOffset,
      isPast: i < todayOffset,
      isTraining: i < trainingDays,
    };
  });
  const todayName = DAY_NAMES[todayIndex];
  const doneDays = week.filter((d) => d.isTraining && (d.isPast || d.isToday)).length;

  const timeGreeting = hour < 12 ? 'GOOD MORNING' : hour < 18 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
  const displayName = user?.display_name || profile?.name || 'Athlete';
  const isPro = !!user?.is_pro;
  const availableWorkouts = (explore?.workouts || []).filter((w: any) => isPro || w.lock !== '1_1');
  const featured = availableWorkouts.find((w: any) => w.name) || availableWorkouts[0];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        <ScreenEnter>
          {/* greeting card */}
          <GradientBox
            radius={22}
            colors={['#F6F9FF', '#E8F0FF']}
            style={styles.profileCard}
          >
            <View style={styles.profileTop}>
              <View style={styles.avatarWrap}>
                <GradientBox radius={24} style={styles.avatarGradient}>
                  <Text style={styles.avatarInitial}>{displayName.charAt(0).toUpperCase()}</Text>
                </GradientBox>
                <View style={styles.onlineDot} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.timeGreet}>{timeGreeting} 👋</Text>
                <Text style={styles.name}>{displayName}</Text>
              </View>
              <TouchableOpacity style={styles.settingsBtn} onPress={() => nav.navigate('Settings')}>
                <Icon name="settings" size={19} color={colors.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.profileChips}>
              <TouchableOpacity style={styles.profileChip} onPress={() => setChipInfo({
                kind: 'points',
                points: Number(user?.points || 0),
                sessions: Number(dashboard?.totals?.sessions || 0),
              })}>
                <Icon name="flame" size={14} color="#FF8A29" />
                <Text style={styles.chipValue}>{formatPoints(Number(user?.points || 0))} pts</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.profileChip} onPress={() => setChipInfo({
                kind: 'sessions',
                sessions: Number(dashboard?.totals?.sessions || 0),
                totals: dashboard?.totals,
              })}>
                <Icon name="award" size={14} color={colors.primary} />
                <Text style={styles.chipValue}>{dashboard?.totals?.sessions || 0} workouts</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.profileChip} onPress={() => setChipInfo({
                kind: 'level',
                level: String(profile.pushupLevel || 'Beginner').replace(/^./, (c) => c.toUpperCase()),
                focusAreas: profile.focusAreas || [],
                weeklyDays: trainingDays,
                goal: profile.mainGoal || profile.goal,
              })}>
                <Icon name="dumbbell" size={14} color={colors.primary} />
                <Text style={styles.chipValue}>{String(profile.pushupLevel || 'Beginner').replace(/^./, (c) => c.toUpperCase())}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.profileChip} onPress={() => setCalOpen(true)}>
                <Icon name="calendar" size={14} color={colors.primary} />
                <Text style={styles.chipValue}>{trainingDays} days/wk</Text>
              </TouchableOpacity>
            </View>
          </GradientBox>

          {/* weekly goal card */}
          <View style={styles.weekCard}>
            <View style={styles.weekCardHead}>
              <View>
                <Text style={styles.weekCardTitle}>WEEKLY GOAL</Text>
                <Text style={styles.weekCardSub}>{todayName} · {trainingDays} days planned</Text>
              </View>
              <View style={styles.weekDone}>
                <Text style={styles.weekDoneValue}>{doneDays}<Text style={styles.weekDoneTotal}>/{trainingDays}</Text></Text>
                <Text style={styles.weekDoneLabel}>DONE</Text>
              </View>
            </View>

            <View style={styles.weekTrack}>
              <View style={[styles.weekTrackFill, { width: `${(doneDays / trainingDays) * 100}%` }]} />
            </View>

            <View style={styles.weekDays}>
              {week.map((d) => (
                <View key={d.key} style={styles.weekDayWrap}>
                  {d.isToday ? (
                    <GradientBox radius={14} style={styles.weekTile}>
                      <View style={styles.weekTileInner}>
                        <Text style={styles.weekTileDayOn}>{d.name.charAt(0)}</Text>
                        <Text style={styles.weekTileDateOn}>{d.date}</Text>
                      </View>
                    </GradientBox>
                  ) : (
                    <View style={[
                      styles.weekTile,
                      d.isTraining ? styles.weekTileTraining : styles.weekTileRest,
                      d.isPast && !d.isTraining && styles.weekTilePast,
                    ]}>
                      <View style={styles.weekTileInner}>
                        <Text style={[styles.weekTileDay, d.isTraining && styles.weekTileDayBlue]}>{d.name.charAt(0)}</Text>
                        <Text style={[styles.weekTileDate, d.isTraining && styles.weekTileDateBlue]}>{d.date}</Text>
                      </View>
                    </View>
                  )}
                  <Text style={[
                    styles.weekTileLabel,
                    d.isToday && styles.weekTileLabelOn,
                  ]}>{d.isToday ? 'TODAY' : d.isTraining ? 'TRAIN' : 'REST'}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* illustration-led hero */}
          <Pressable
            style={({ pressed }) => [styles.hero, pressed && styles.heroActive]}
            onPress={() => featured && nav.navigate('WorkoutDetail', {
              workoutId: featured.id,
              planCode: featured.planCode || undefined,
            })}
          >
            <View style={styles.heroCopy}>
              <Text style={styles.heroKicker}>{label(lang, 'todayPick')}</Text>
              <Text style={styles.heroTitle} numberOfLines={2}>{featured?.name || 'Start your workout'}</Text>
              <Text style={styles.heroSub} numberOfLines={2}>
                {featured?.description || 'A quick, effective session you can do anywhere.'}
              </Text>
              <View style={styles.heroCta}>
                <Text style={styles.heroCtaText}>{label(lang, 'startNow')}</Text>
                <Icon name="play" size={13} color={colors.primary} />
              </View>
            </View>
            <View style={styles.heroArt}>
              <ExerciseArt actionId={featured?.firstActionId} size={140} glyph="◆" />
            </View>
          </Pressable>

          {/* stats - light, no heavy boxes */}
          <View style={styles.stats}>
            <Stat icon="check" value={String(dashboard?.totals?.sessions || 0)} label="Workouts" />
            <Stat icon="clock" value={String(Math.round((dashboard?.totals?.total_seconds || 0) / 60))} label="Minutes" />
            <Stat icon="flame" value={String(Math.round(dashboard?.totals?.total_calories || 0))} label="kcal burned" />
          </View>

          {/* featured workouts, same photo-card style as the real app */}
          <View style={styles.featuredHead}>
            <View style={styles.headWithIcon}>
              <Icon name="star" size={16} color={colors.primary} />
              <Text style={styles.featuredTitle}>RECOMMENDED FOR YOU</Text>
            </View>
            <TouchableOpacity onPress={() => nav.navigate('Workouts')}>
              <Text style={styles.featuredMore}>SEE ALL</Text>
            </TouchableOpacity>
          </View>
          {[0, 1, 2].map((i) => (
            <PhotoWorkoutCard
              key={i}
              title={['FULL BODY · 7X4 CHALLENGE', 'CHEST · BEGINNER', 'ABS · BEGINNER'][i]}
              minutes={['23 day left', '12 min', '12 min'][i]}
              level={['18', '2', '2'][i]}
              image={COVERS[i]}
              onPress={() => nav.navigate('Workouts')}
            />
          ))}

          {/* onboarding-driven report: built from the 10 answers */}
          {(() => {
            const areas = profile.focusAreas?.length ? profile.focusAreas : ['Full Body'];
            const exercises = Array.from(new Set(areas.flatMap((a) => FOCUS_EXERCISES[a] || [])));
            const level = profile.pushupLevel || 'beginner';
            const rows: Array<[string, string]> = [
              ['Goal', (profile.mainGoal || profile.goal || 'stay_fit').replace('_', ' ')],
              ['Level', level.charAt(0).toUpperCase() + level.slice(1)],
              ['Training days', `${profile.weeklyDays || 3} days / week`],
              ['Starts on', profile.firstDayOfWeek || 'SUNDAY'],
              ['Weight', profile.weightKg ? `${profile.weightKg} kg` : '—'],
              ['Height', profile.heightCm ? `${profile.heightCm} cm` : '—'],
            ];
            return (
              <View style={styles.report}>
                <View style={styles.reportHead}>
                  <Text style={styles.reportTitle}>Your plan report</Text>
                  <Text style={styles.reportBadge}>BASED ON YOUR ANSWERS</Text>
                </View>
                <View style={styles.reportGrid}>
                  {rows.map(([k, v]) => (
                    <View key={k} style={styles.reportCell}>
                      <Text style={styles.reportKey}>{k}</Text>
                      <Text style={styles.reportValue}>{v}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.reportSub}>Exercises for you · {REPS[level]}</Text>
                <View style={styles.exerciseWrap}>
                  {exercises.map((e) => (
                    <View key={e} style={styles.exerciseChip}><Text style={styles.exerciseText}>{e}</Text></View>
                  ))}
                </View>
              </View>
            );
          })()}

          {/* motivation card - tap to shuffle */}
          <Pressable
            style={({ pressed }) => [styles.quote, pressed && styles.quotePressed]}
            onPress={shuffleQuote}
          >
            <View style={styles.quoteHead}>
              <View style={styles.quoteIcon}><Icon name="star" size={13} color={colors.white} /></View>
              <Text style={styles.quoteKicker}>DAILY MOTIVATION</Text>
              <View style={styles.quoteRefresh}>
                <Icon name="share" size={13} color={colors.primary} />
                <Text style={styles.quoteRefreshText}>{quoteLoading ? '...' : 'NEW'}</Text>
              </View>
            </View>
            <Text style={styles.quoteText} numberOfLines={3}>{quote}</Text>
          </Pressable>

          {explore?.modules?.map((m: any) => {
            const items = (m.items || []).filter((it: any) => {
              const w = it.workout || it.list?.workouts?.[0];
              return (it.workout || it.list) && (isPro || !w || w.lock !== '1_1');
            });
            if (!items.length) return null;
            const isBodyModule = /body|focus/i.test(`${m.id || ''} ${m.name || ''} ${m.nameKey || ''}`);
            return (
              <Section
                key={m.id}
                title={m.name || m.nameKey}
                action="See all"
                onAction={() => {
                  if (isBodyModule) setWorkoutFilter({ category: '', level: 'all' });
                  nav.navigate('Workouts');
                }}
                style={styles.section}
              >
                <ScrollView horizontal showsHorizontalScrollIndicator={false} removeClippedSubviews contentContainerStyle={styles.carousel}>
                  {items.map((it: any, i: number) => {
                    const w = it.workout || it.list?.workouts?.[0];
                    if (!w) return null;
                    return (
                      <WorkoutCard
                        key={`${it.type}-${it.id}`}
                        workout={{ ...w, name: it.name || w.name }}
                        index={i}
                        onPress={() => {
                          if (isBodyModule) {
                            setWorkoutFilter({ category: normalizeCategory(it.name || w.name || ''), level: 'all' });
                            nav.navigate('Workouts');
                          } else if (it.type === 'list') {
                            nav.navigate('ExploreList', { listId: it.id, title: it.name });
                          } else {
                            nav.navigate('WorkoutDetail', { workoutId: it.id, planCode: w.planCode });
                          }
                        }}
                      />
                    );
                  })}
                </ScrollView>
              </Section>
            );
          })}

          <TrainingHomeExtras />
          <View style={{ height: 24 }} />
        </ScreenEnter>
      </ScrollView>
      <CalendarModal
        visible={calOpen}
        onClose={() => setCalOpen(false)}
        weeklyDays={trainingDays}
        firstDayOfWeek={profile.firstDayOfWeek}
      />
      <ChipInfoModal info={chipInfo} onClose={() => setChipInfo(null)} />
    </SafeAreaView>
  );
}

function Stat({ icon, value, label }: { icon: any; value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Icon name={icon} size={16} color={colors.primary} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingBottom: 90 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xs },
  headerKicker: { ...typography.tiny, color: colors.textMuted, fontWeight: '900', letterSpacing: 1.4 },
  headerTitle: { fontSize: 26, fontWeight: '900', color: colors.text, marginTop: 4, letterSpacing: -0.6 },
  profileCard: { marginHorizontal: spacing.lg, marginTop: spacing.lg, padding: spacing.lg, borderWidth: 1, borderColor: '#DCE7FF' },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarWrap: { width: 50, height: 50 },
  avatarGradient: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', ...shadows.button },
  avatarInitial: { color: colors.white, fontSize: 20, fontWeight: '900' },
  onlineDot: { position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, backgroundColor: '#2ED47A', borderWidth: 2, borderColor: colors.white },
  settingsBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  greetTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  dateLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginTop: 12 },
  timeGreet: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  headline: { color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 2 },
  name: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.6, marginTop: 2 },
  // Exactly 2 chips per row -> a true 2x2 grid, never 3 + 1.
  profileChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  profileChip: {
    width: '48%', flexShrink: 0, minWidth: 0, maxWidth: '100%',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: colors.white, borderRadius: 12,
    paddingVertical: 9, paddingHorizontal: 6,
    borderWidth: 1, borderColor: '#E3E9F7',
  },
  chipIcon: { fontSize: 14 },
  chipValue: { color: colors.text, fontSize: 11, fontWeight: '800', flexShrink: 1, textAlign: 'center' },

  hero: {
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
    minHeight: 186, borderRadius: radius.xl,
    backgroundColor: colors.primary,
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.lg, overflow: 'hidden', ...shadows.button,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  heroActive: { transform: [{ scale: 0.985 }], borderColor: colors.white, opacity: 0.95 },
  heroCopy: { flex: 1, zIndex: 2 },
  heroKicker: { ...typography.tiny, color: 'rgba(255,255,255,0.75)', letterSpacing: 1.4 },
  heroTitle: { ...typography.h2, color: colors.white, marginTop: 8, lineHeight: 27 },
  heroSub: { ...typography.caption, color: 'rgba(255,255,255,0.8)', marginTop: 6, lineHeight: 17 },
  heroCta: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6,
    backgroundColor: colors.white, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 8, marginTop: 14,
  },
  heroCtaText: { ...typography.caption, color: colors.primary, fontWeight: '800' },
  heroArt: {
    width: 132, height: 150, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: radius.lg,
    marginLeft: -8,
  },

  stats: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  stat: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: colors.white, borderRadius: radius.lg,
    paddingVertical: 14, ...shadows.card,
  },
  statValue: { ...typography.h3, color: colors.text, marginTop: 2 },
  statLabel: { ...typography.tiny, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },

  quote: {
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
    backgroundColor: '#EEF3FF', borderRadius: radius.lg,
    padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.primary,
    borderWidth: 1, borderColor: '#DCE6FF',
  },
  quotePressed: { transform: [{ scale: 0.985 }], backgroundColor: '#E4EDFF' },
  quoteHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  quoteIcon: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  quoteKicker: { ...typography.tiny, color: colors.primary, fontWeight: '800', letterSpacing: 1 },
  quoteRefresh: {
    marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.white, borderRadius: radius.sm,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  quoteRefreshText: { ...typography.tiny, color: colors.primary, fontWeight: '800' },
  quoteText: { ...typography.body, color: colors.text, fontStyle: 'italic', lineHeight: 20 },

  weekCard: {
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.xl,
    padding: spacing.lg, ...shadows.card,
    shadowColor: '#274B9F', shadowOpacity: 0.10, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 5,
  },
  weekCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekCardTitle: { color: colors.text, fontSize: 14, fontWeight: '900', letterSpacing: 0.8 },
  weekCardSub: { color: colors.textSecondary, fontSize: 11, marginTop: 3, textTransform: 'capitalize' },
  weekDone: { alignItems: 'flex-end' },
  weekDoneValue: { color: colors.primary, fontSize: 20, fontWeight: '900' },
  weekDoneTotal: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  weekDoneLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  weekTrack: { height: 5, borderRadius: 3, backgroundColor: '#EDF0F6', marginTop: 12, overflow: 'hidden' },
  weekTrackFill: { height: 5, borderRadius: 3, backgroundColor: colors.primary },
  weekDays: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, marginTop: 16 },
  weekDayWrap: { alignItems: 'center', flex: 1 },
  weekTile: { width: 42, height: 52, borderRadius: 14 },
  weekTileInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  weekTileTraining: { backgroundColor: '#EAF0FF' },
  weekTileRest: { backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border },
  weekTilePast: { opacity: 0.55 },
  weekTileDay: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  weekTileDayBlue: { color: colors.primary },
  weekTileDate: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 2 },
  weekTileDateBlue: { color: colors.primary },
  weekTileDayOn: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '800' },
  weekTileDateOn: { color: colors.white, fontSize: 18, fontWeight: '900', marginTop: 2 },
  weekTileLabel: { color: colors.textMuted, fontSize: 8, fontWeight: '800', letterSpacing: 0.4, marginTop: 7 },
  weekTileLabelOn: { color: colors.primary },
  featuredHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginTop: spacing.xxl, marginBottom: spacing.md },
  headWithIcon: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  featuredTitle: { color: colors.text, fontSize: 16, fontWeight: '900', letterSpacing: 0.6 },
  featuredMore: { color: colors.primary, fontSize: 11, fontWeight: '800' },

  report: {
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
    backgroundColor: colors.white, borderRadius: radius.xl,
    padding: spacing.lg, ...shadows.card,
  },
  reportHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  reportTitle: { ...typography.h3, color: colors.text },
  reportBadge: { fontSize: 9, fontWeight: '800', color: colors.primary, letterSpacing: 0.6 },
  reportGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reportCell: { width: '47%', backgroundColor: colors.canvas, borderRadius: radius.md, padding: 10 },
  reportKey: { fontSize: 10, color: colors.textSecondary },
  reportValue: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: 3, textTransform: 'capitalize' },
  reportSub: { ...typography.caption, color: colors.textSecondary, marginTop: 16, marginBottom: 8 },
  exerciseWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  exerciseChip: { backgroundColor: '#EAF0FF', borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 7 },
  exerciseText: { fontSize: 12, fontWeight: '700', color: colors.primary },

  section: { marginTop: spacing.xxl, paddingHorizontal: spacing.lg },
  carousel: { paddingRight: spacing.sm, paddingTop: 6, paddingBottom: 8 },
});
