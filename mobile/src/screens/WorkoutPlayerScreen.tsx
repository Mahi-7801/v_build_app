import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Pressable, Modal, Animated } from 'react-native';
import { Text } from '../components/LocalizedText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors } from '../theme/colors';
import { radius, spacing, shadows, typography } from '../theme/theme';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';
import { TimerRing, RoundButton } from '../components/TimerRing';
import { ExerciseArt } from '../components/ExerciseArt';
import * as Speech from 'expo-speech';
import * as KeepAwake from 'expo-keep-awake';
import { historyApi } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { pointsForSession } from '../points';

type Props = NativeStackScreenProps<RootStackParamList, 'Player'>;
type Phase = 'countdown' | 'exercise' | 'rest' | 'done';

export default function WorkoutPlayerScreen({ route }: Props) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { planId, title, items } = route.params || {};
  const { settings, lang } = useAppStore();

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('countdown');
  const [remaining, setRemaining] = useState(3);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [calories, setCalories] = useState(0);
  const [finished, setFinished] = useState(false);
  const loggedRef = useRef(new Set<number>());
  const scale = useRef(new Animated.Value(1)).current;

  const current = items?.[index];
  const restMultiplier = Number(settings?.rest_multiplier ?? 1);
  const exerciseSec = Math.max(1, Number(current?.time_sec || 30));
  const restSec = Math.max(0, Math.round(Number(current?.rest_sec || 15) * restMultiplier));
  const voiceOn = !!settings?.voice_enabled;
  const speechLang = lang === 'te' ? 'te-IN' : String(lang || 'en').replace('_', '-');

  /** Speak coaching cues using the user's voice + rate settings. */
  const speak = useCallback((text: string) => {
    if (!voiceOn || !text) return;
    try {
      Speech.stop();
      Speech.speak(text, {
        language: speechLang,
        rate: Math.max(0.5, Math.min(2, Number(settings?.voice_rate || 100) / 100)),
        pitch: 1,
      });
    } catch { /* speech unavailable on this device */ }
  }, [voiceOn, speechLang, settings?.voice_rate]);

  // Keep the screen awake while a workout is active (Settings -> Keep screen on).
  useEffect(() => {
    if (settings?.keep_screen_on === false) return;
    KeepAwake.activateKeepAwakeAsync('homeworkout-player').catch(() => {});
    return () => { KeepAwake.deactivateKeepAwake('homeworkout-player').catch(() => {}); };
  }, [settings?.keep_screen_on]);

  useEffect(() => () => { try { Speech.stop(); } catch { /* ignore */ } }, []);

  // Voice cues on every phase change.
  useEffect(() => {
    if (!running || paused) return;
    if (phase === 'countdown') speak('Get ready');
    else if (phase === 'exercise') speak(`${current?.name || 'Exercise'} , ${exerciseSec} seconds`);
    else if (phase === 'rest' && restSec > 0) speak('Rest');
  }, [phase, index, running, paused, speak, current?.name, exerciseSec, restSec]);

  // Countdown numbers 3, 2, 1.
  useEffect(() => {
    if (running && !paused && phase === 'countdown' && remaining > 0) speak(String(remaining));
  }, [remaining, phase, running, paused, speak]);

  const phaseDuration = phase === 'countdown' ? 3 : phase === 'exercise' ? exerciseSec : phase === 'rest' ? restSec : 0;
  const progress = phaseDuration > 0 ? (phaseDuration - remaining) / phaseDuration : 1;

  // start session once
  useEffect(() => {
    const planned = (items || []).reduce((a: number, i: any) => a + (i.time_sec || 0) + (i.rest_sec || 0), 0);
    historyApi.startSession({
      planId,
      title,
      plannedDurationSec: planned,
      exercisesTotal: items?.length || 0,
    }).then((r) => setSessionId(r.data.session?.id || null)).catch(() => {});
  }, [planId, title, items]);

  // pulse animation for the active exercise
  useEffect(() => {
    if (running && phase === 'exercise') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.04, duration: 900, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      ).start();
    } else {
      scale.setValue(1);
    }
    return () => { scale.setValue(1); };
  }, [running, phase, scale]);

  const finish = useCallback(() => {
    if (finished) return;
    setFinished(true);
    setRunning(false);
    if (sessionId) {
      historyApi.completeSession(sessionId, {
        durationSec: elapsed,
        totalCalories: calories,
        exercisesDone: items?.length || 0,
      }).catch(() => {});
    }
    nav.replace('Result', {
      durationSec: elapsed,
      calories,
      exercisesDone: items?.length || 0,
      exercisesTotal: items?.length || 0,
      sessionId,
      title,
      pointsEarned: pointsForSession({
        durationSec: elapsed,
        calories,
        exercisesDone: items?.length || 0,
      }),
    });
  }, [finished, sessionId, elapsed, calories, items, nav, title]);

  // ticking
  useEffect(() => {
    if (!running || paused || finished) return;
    const timer = setInterval(() => {
      setElapsed((e) => e + 1);
      setCalories((c) => c + 0.12);
      setRemaining((r) => {
        if (r > 1) return r - 1;

        // phase boundary
        if (phase === 'countdown') {
          setPhase('exercise');
          return exerciseSec;
        }
        if (phase === 'exercise') {
          if (sessionId && current && !loggedRef.current.has(index)) {
            loggedRef.current.add(index);
            historyApi.logExercise(sessionId, {
              exerciseId: current.exercise_id || null,
              sequence: index + 1,
              plannedSec: exerciseSec,
              actualSec: exerciseSec,
              reps: 0,
              calories: 0.12 * exerciseSec,
              skipped: false,
            }).catch(() => {});
          }
          if (restSec > 0) { setPhase('rest'); return restSec; }
          if (index + 1 < (items?.length || 0)) {
            setIndex(index + 1);
            setPhase('exercise');
            return Number(items[index + 1].time_sec || 30);
          }
          finish();
          return 0;
        }
        // rest finished
        if (index + 1 < (items?.length || 0)) {
          setIndex(index + 1);
          setPhase('exercise');
          return Number(items[index + 1].time_sec || 30);
        }
        finish();
        return 0;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running, paused, finished, phase, exerciseSec, restSec, index, items, sessionId, current, finish, scale]);

  const isPlaying = running && !paused;

  /** Pause and resume are explicit so the label and timer can never disagree. */
  const pauseWorkout = () => { setRunning(false); setPaused(true); };
  const resumeWorkout = () => { setPaused(false); setRunning(true); };
  const toggle = () => { if (isPlaying) pauseWorkout(); else resumeWorkout(); };

  const skip = () => {
    if (phase === 'countdown') { setPhase('exercise'); setRemaining(exerciseSec); return; }
    if (phase === 'exercise') {
      if (restSec > 0) { setPhase('rest'); setRemaining(restSec); }
      else next();
    } else {
      next();
    }
  };

  const next = () => {
    if (index + 1 < (items?.length || 0)) {
      setIndex(index + 1);
      setPhase('exercise');
      setRemaining(Number(items[index + 1].time_sec || 30));
    } else {
      finish();
    }
  };

  const displayTime = Math.max(0, remaining);
  const label = phase === 'countdown' ? String(displayTime)
    : phase === 'rest' ? `0:${String(displayTime).padStart(2, '0')}`
    : `${Math.floor(displayTime / 60)}:${String(displayTime % 60).padStart(2, '0')}`;

  const sublabel = phase === 'countdown' ? 'GET READY' : phase === 'rest' ? 'REST' : 'EXERCISE';
  const nextItem = items?.[index + 1];

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={pauseWorkout} style={styles.iconBtn}>
          <Icon name="close" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.sub}>{index + 1} / {items?.length || 0} exercises</Text>
        </View>
        <TouchableOpacity onPress={pauseWorkout} style={styles.iconBtn}>
          <Icon name="pause" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${((index + (progress || 0)) / Math.max(1, items?.length || 1)) * 100}%` }]} />
      </View>
      <View style={styles.dots}>
        {(items || []).slice(0, 24).map((_: any, i: number) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive, i < index && styles.dotDone]} />
        ))}
      </View>

      <Animated.View style={[styles.center, { transform: [{ scale }] }]}>
        <View style={[
          styles.phasePill,
          { backgroundColor: phase === 'rest' ? colors.success : phase === 'countdown' ? colors.pro : colors.primary },
        ]}>
          <Text style={styles.phaseText}>{sublabel}</Text>
        </View>
        <View style={styles.playerArt}>
          <ExerciseArt actionId={current?.action_id} size={132} />
        </View>
        <Text style={styles.exerciseName} numberOfLines={2}>
          {phase === 'countdown' ? 'Get ready!' : current?.name || `Exercise ${current?.action_id ?? index + 1}`}
        </Text>

        <TimerRing progress={progress} size={230} stroke={14} label={label} sublabel={sublabel} />

        <View style={styles.timerMeta}>
          <Text style={styles.metaText}>{phase === 'rest' ? 'Next in' : 'Time left'}</Text>
          <Text style={styles.metaValue}>{displayTime}s</Text>
        </View>
      </Animated.View>

      {/* segmented control bar */}
      <View style={styles.controls}>
        <Pressable
          style={({ pressed }) => [styles.controlBtn, styles.controlSide, pressed && styles.controlPressed]}
          onPress={() => { if (index > 0) { setIndex(index - 1); setPhase('exercise'); setRemaining(exerciseSec); } }}
        >
          <Icon name="back" size={18} color={colors.text} />
          <Text style={styles.controlText}>BACK</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.controlBtn, styles.controlMain, pressed && styles.controlMainPressed]}
          onPress={toggle}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={20} color={colors.white} />
          <Text style={[styles.controlText, styles.controlTextMain]}>{isPlaying ? 'PAUSE' : 'PLAY'}</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.controlBtn, styles.controlSide, pressed && styles.controlPressed]}
          onPress={skip}
        >
          <Icon name="skip" size={18} color={colors.text} />
          <Text style={styles.controlText}>SKIP</Text>
        </Pressable>
      </View>

      {!!nextItem && (
        <View style={styles.upNext}>
          <Text style={styles.upNextLabel}>UP NEXT</Text>
          <Text style={styles.upNextName} numberOfLines={1}>{nextItem.name || `Exercise ${nextItem.action_id}`}</Text>
        </View>
      )}

      <View style={styles.statusRow}>
        <View style={styles.statusChip}>
          <Icon name="bell" size={12} color={voiceOn ? colors.primary : colors.textMuted} />
          <Text style={[styles.statusText, voiceOn && styles.statusOn]}>Voice {voiceOn ? 'ON' : 'OFF'}</Text>
        </View>
        <View style={styles.statusChip}>
          <Icon name="star" size={12} color={settings?.keep_screen_on === false ? colors.textMuted : colors.primary} />
          <Text style={[styles.statusText, settings?.keep_screen_on !== false && styles.statusOn]}>
            Screen {settings?.keep_screen_on === false ? 'OFF' : 'ON'}
          </Text>
        </View>
      </View>

      {/* Pause overlay - equivalent to the original PauseActivity */}
      <Modal visible={paused} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}><Icon name="pause" size={30} color={colors.white} /></View>
            <Text style={styles.modalTitle}>Workout paused</Text>
            <Text style={styles.modalText}>Take a breath — your timer is stopped.</Text>
            <Button title="Resume" full onPress={resumeWorkout} icon={<Icon name="play" size={16} color={colors.white} />} />
            <Button title="End workout" variant="ghost" full onPress={() => { setPaused(false); finish(); }} style={styles.endBtn} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.bodyBold, color: colors.text },
  sub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  progressBar: { height: 7, backgroundColor: colors.border, marginHorizontal: spacing.lg, marginTop: spacing.lg, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 8, paddingHorizontal: spacing.lg },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { width: 18, backgroundColor: colors.primary },
  dotDone: { backgroundColor: colors.primaryLight },
  phasePill: {
    borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6,
    marginBottom: spacing.md,
  },
  phaseText: { ...typography.tiny, color: colors.white, fontWeight: '800', letterSpacing: 1.2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  playerArt: { backgroundColor: '#EAF0FF', borderRadius: 18, marginBottom: spacing.md, overflow: 'hidden' },
  exerciseName: { ...typography.h2, color: colors.text, textAlign: 'center', marginBottom: spacing.md, minHeight: 54 },
  timerMeta: { alignItems: 'center', marginTop: spacing.xl },
  metaText: { ...typography.caption, color: colors.textSecondary },
  metaValue: { ...typography.h3, color: colors.primary, marginTop: 2 },
  controls: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.lg, backgroundColor: colors.white,
    borderRadius: radius.md, padding: spacing.sm, ...shadows.card,
  },
  controlBtn: {
    flex: 1, height: 54, borderRadius: radius.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  controlSide: { backgroundColor: colors.canvas },
  controlMain: { backgroundColor: colors.primary, flex: 1.25 },
  controlPressed: { transform: [{ scale: 0.96 }], opacity: 0.8 },
  controlMainPressed: { transform: [{ scale: 0.96 }], backgroundColor: colors.primaryDark },
  controlText: { ...typography.tiny, color: colors.text, fontWeight: '800', letterSpacing: 0.6 },
  controlTextMain: { color: colors.white },
  upNext: { alignItems: 'center', paddingBottom: spacing.xl },
  statusRow: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.xl },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.white, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  statusText: { ...typography.tiny, color: colors.textMuted, fontWeight: '800' },
  statusOn: { color: colors.primary },
  upNextLabel: { ...typography.tiny, color: colors.textMuted, letterSpacing: 1.5 },
  upNextName: { ...typography.body, color: colors.textSecondary, marginTop: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(28,33,44,0.6)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  modalCard: { width: '100%', backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center' },
  modalIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { ...typography.h2, color: colors.text, marginTop: spacing.lg },
  modalText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl },
  endBtn: { marginTop: spacing.sm },
});
