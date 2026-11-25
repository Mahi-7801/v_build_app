import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text } from '../components/LocalizedText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors } from '../theme/colors';
import { radius, spacing, typography, shadows } from '../theme/theme';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { ExerciseArt } from '../components/ExerciseArt';
import { plansApi, exploreApi } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import type { PlanDetail } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkoutDetail'>;

export default function WorkoutDetailScreen({ route }: Props) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { workoutId, planCode, planId } = route.params || {};
  const { user, lang } = useAppStore();
  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [workout, setWorkout] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        if (workoutId) {
          const { data } = await exploreApi.workout(workoutId, lang);
          setWorkout(data.workout);
          const code = data.workout?.planCode;
          if (code) {
            try {
              const p = await plansApi.detail(code);
              setDetail(p.data);
            } catch {
              // Some codes are stale — the numeric plan id still resolves.
              if (planId) {
                const p = await plansApi.detail(planId);
                setDetail(p.data);
              }
            }
          }
        } else {
          try {
            const p = await plansApi.detail(planCode || String(planId));
            setDetail(p.data);
          } catch {
            if (planId && String(planId) !== String(planCode)) {
              const p = await plansApi.detail(planId);
              setDetail(p.data);
            }
          }
        }
      } catch { /* keep empty state */ }
      finally { setLoading(false); }
    })();
  }, [workoutId, planCode, planId, lang]);

  const start = async () => {
    if (!detail) return;
    setStarting(true);
    try {
      await plansApi.start(detail.plan.id);
      await useAppStore.getState().refreshUser();
    } catch { /* offline play still works */ }
    setStarting(false);
    nav.navigate('Player', {
      planId: detail.plan.id,
      planCode: detail.plan.code,
      title: workout?.name || detail.plan.name,
      items: dayItems,
    });
  };

  if (loading) {
    return <View style={[styles.root, styles.center]}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }

  const plan = detail?.plan;
  const allItems = detail?.items || [];
  const days = detail?.days || [];
  // Multi-day plans (e.g. 7__4_beginner has 28 days) must be played one day at a time.
  const activeDay = days[selectedDay];
  const dayItems = activeDay ? allItems.filter((i) => i.day_id === activeDay.id) : allItems;
  const minutes = Math.round((activeDay
    ? dayItems.reduce((a, i) => a + i.time_sec + i.rest_sec, 0)
    : (plan?.duration_sec || workout?.durationSec || 0)) / 60);
  const locked = ((workout?.lock === '1_1') || !!plan?.is_pro) && !user?.is_pro;

  if (!detail && !workout) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => nav.goBack()} style={styles.iconBtn}>
            <Icon name="back" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={[styles.center, { flex: 1, padding: spacing.xl }]}>
          <Icon name="info" size={40} color={colors.textMuted} />
          <Text style={[styles.title, { textAlign: 'center' }]}>Workout data unavailable</Text>
          <Text style={[styles.desc, { textAlign: 'center' }]}>Please check your connection and open the workout again.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.iconBtn}>
          <Icon name="back" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <ExerciseArt actionId={dayItems[0]?.action_id} size={170} />
          {locked && (
            <View style={styles.proBadge}><Icon name="crown" size={13} color={colors.white} /><Text style={styles.proText}>PRO</Text></View>
          )}
        </View>

        <Text style={styles.title}>{workout?.name || plan?.name || 'Workout'}</Text>
        <Text style={styles.desc}>{workout?.description || plan?.description || 'A quick, effective workout you can do anywhere — no equipment needed.'}</Text>

        <View style={styles.facts}>
          <Fact icon="clock" value={`${minutes || workout?.minutes || 7} min`} label="Duration" />
          <Fact icon="dumbbell" value={String(dayItems.length || plan?.total_exercises || 0)} label="Exercises" />
          <Fact icon="flame" value={String(plan?.level || workout?.level || 1)} label="Level" />
        </View>

        {days.length > 1 && (
          <View style={styles.dayPicker}>
            <Text style={styles.sectionTitle}>Choose a day</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {days.map((d, i) => (
                <TouchableOpacity
                  key={d.id}
                  onPress={() => setSelectedDay(i)}
                  style={[styles.dayChip, selectedDay === i && styles.dayChipActive]}
                >
                  <Text style={[styles.dayChipText, selectedDay === i && styles.dayChipTextActive]}>Day {d.day_index}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {!!dayItems.length && (
          <View style={styles.exerciseList}>
            <Text style={styles.sectionTitle}>Exercises {days.length > 1 ? `· Day ${activeDay?.day_index}` : ''}</Text>
            {dayItems.map((it, i) => (
              <TouchableOpacity
                key={it.id}
                style={styles.exerciseRow}
                onPress={() => nav.navigate('ExerciseDetail', {
                  exerciseId: it.exercise_id || undefined,
                  actionId: it.action_id,
                  name: it.name || undefined,
                })}
              >
                <View style={styles.num}><Text style={styles.numText}>{i + 1}</Text></View>
                <ExerciseArt actionId={it.action_id} size={42} glyph="◉" style={styles.thumb} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.exName}>{it.name || it.slug || `Exercise ${it.action_id}`}</Text>
                  <Text style={styles.exMeta}>{it.time_sec}s · {it.rest_sec}s rest</Text>
                </View>
                <Icon name="chevron" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {locked ? (
          <Button title="Unlock with PRO" onPress={() => nav.navigate('Pro')} full icon={<Icon name="crown" size={18} color={colors.white} />} />
        ) : (
          <Button title="Start workout" onPress={start} loading={starting} full icon={<Icon name="play" size={16} color={colors.white} />} />
        )}
      </View>
    </SafeAreaView>
  );
}

function Fact({ icon, value, label }: { icon: any; value: string; label: string }) {
  return (
    <View style={[styles.fact, shadows.card]}>
      <Icon name={icon} size={18} color={colors.primary} />
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  content: { padding: spacing.lg, paddingBottom: 30 },
  hero: {
    height: 210, borderRadius: radius.xl, marginTop: spacing.md,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    ...shadows.button,
  },
  heroGlyph: { fontSize: 100, color: 'rgba(255,255,255,0.85)', fontWeight: '300' },
  proBadge: { position: 'absolute', top: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  proText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  title: { ...typography.h1, color: colors.text, marginTop: spacing.xl },
  desc: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  facts: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  fact: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', gap: 4 },
  factValue: { ...typography.h3, color: colors.text },
  factLabel: { ...typography.tiny, color: colors.textSecondary, textTransform: 'uppercase' },
  exerciseList: { marginTop: spacing.xxl },
  dayPicker: { marginTop: spacing.xl },
  dayChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.pill, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm,
  },
  dayChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayChipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  dayChipTextActive: { color: colors.white },
  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  num: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#EAF0FF', alignItems: 'center', justifyContent: 'center' },
  numText: { ...typography.caption, color: colors.primary, fontWeight: '800' },
  thumb: { backgroundColor: '#EAF0FF', borderRadius: 10, overflow: 'hidden' },
  exName: { ...typography.bodyBold, color: colors.text },
  exMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  footer: { padding: spacing.lg, backgroundColor: colors.canvas },
});
