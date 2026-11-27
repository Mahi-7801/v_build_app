import React, { useEffect, useMemo, useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from '../components/LocalizedText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { radius, spacing, typography, shadows } from '../theme/theme';
import { Icon } from '../components/Icon';
import { ExerciseArt } from '../components/ExerciseArt';
import { SelectModal, type SelectOption } from '../components/SelectModal';
import { BUILDER_FILTERS } from '../data/fitnessCatalog';
import { exercisesApi } from '../api/client';
import type { Exercise } from '../types';

const CUSTOM_WORKOUTS_KEY = '@homeworkout/custom_workouts_v1';
type FilterKey = 'FocusArea' | 'Difficulty' | 'Equipment';

interface SavedCustomWorkout {
  id: string;
  name: string;
  exercises: Exercise[];
  createdAt: string;
}

const LEVEL_NAMES: Record<number, string> = { 1: 'Beginner', 2: 'Intermediate', 3: 'Advanced' };

export default function CustomWorkoutBuilderScreen() {
  const nav = useNavigation<any>();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [workoutName, setWorkoutName] = useState('');
  const [savedWorkouts, setSavedWorkouts] = useState<SavedCustomWorkout[]>([]);
  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    FocusArea: 'All Areas',
    Difficulty: 'All Levels',
    Equipment: 'All Equipment',
  });
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [exRes, rawSaved] = await Promise.all([
          exercisesApi.list({ limit: 150 }).catch(() => ({ data: { items: [] } })),
          AsyncStorage.getItem(CUSTOM_WORKOUTS_KEY),
        ]);
        if (!active) return;
        setExercises(exRes.data?.items || []);
        if (rawSaved) {
          try { setSavedWorkouts(JSON.parse(rawSaved)); } catch { setSavedWorkouts([]); }
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const focusOptions = useMemo(() => {
    const muscles = Array.from(new Set(exercises.map((e) => e.primary_muscle).filter(Boolean))) as string[];
    return muscles.length ? ['All Areas', ...muscles] : [...BUILDER_FILTERS.FocusArea];
  }, [exercises]);

  const equipmentOptions = useMemo(() => {
    const eqs = Array.from(new Set(exercises.map((e) => e.equipment).filter(Boolean))) as string[];
    return eqs.length ? ['All Equipment', ...eqs] : [...BUILDER_FILTERS.Equipment];
  }, [exercises]);

  const filtered = useMemo(() => exercises.filter((ex) => {
    if (filters.FocusArea !== 'All Areas') {
      const m = String(ex.primary_muscle || '').toLowerCase();
      if (!m.includes(filters.FocusArea.toLowerCase())) return false;
    }
    if (filters.Difficulty !== 'All Levels') {
      const lvl = LEVEL_NAMES[Number(ex.level || 1)] || 'Beginner';
      if (lvl.toLowerCase() !== filters.Difficulty.toLowerCase()) return false;
    }
    if (filters.Equipment !== 'All Equipment') {
      const eq = String(ex.equipment || 'none').toLowerCase();
      if (!eq.includes(filters.Equipment.toLowerCase())) return false;
    }
    return true;
  }), [exercises, filters]);

  const toggle = (id: number) => setSelectedIds((prev) =>
    prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]);

  const persistSaved = async (list: SavedCustomWorkout[]) => {
    setSavedWorkouts(list);
    await AsyncStorage.setItem(CUSTOM_WORKOUTS_KEY, JSON.stringify(list));
  };

  const playCustom = (title: string, picked: Exercise[]) => {
    const items = picked.map((ex, i) => ({
      id: ex.id,
      sequence: i + 1,
      action_id: ex.action_id,
      exercise_id: ex.id,
      time_sec: ex.unit === 'reps' ? 35 : 30,
      rest_sec: 15,
      rounds: 1,
      day_id: null,
      name: ex.name,
      slug: ex.slug,
      unit: ex.unit || 'sec',
      image_path: ex.image_path,
      lottie_path: ex.lottie_path,
      audio_url: ex.audio_url || null,
      alternation: ex.alternation,
      speed: ex.speed,
      wm_speed: ex.wm_speed,
      calories_per_unit: ex.calories_per_unit,
    }));
    nav.navigate('Player', {
      planId: null as any,
      planCode: `custom_${Date.now()}`,
      title,
      items,
    });
  };

  const save = async () => {
    const picked = exercises.filter((e) => selectedIds.includes(e.id));
    if (!picked.length) {
      Alert.alert('No exercises', 'Pick at least one exercise before saving.');
      return;
    }
    const name = workoutName.trim() || `Custom Workout (${picked.length})`;
    const entry: SavedCustomWorkout = {
      id: `cw_${Date.now()}`,
      name,
      exercises: picked,
      createdAt: new Date().toISOString(),
    };
    const next = [entry, ...savedWorkouts].slice(0, 20);
    await persistSaved(next);
    setSelectedIds([]);
    setWorkoutName('');
    Alert.alert('Custom workout saved', `"${name}" is ready to start.`, [
      { text: 'Start Now', onPress: () => playCustom(name, picked) },
      { text: 'OK' },
    ]);
  };

  const deleteSaved = async (id: string) => {
    await persistSaved(savedWorkouts.filter((w) => w.id !== id));
  };

  const options: SelectOption[] = openFilter === 'FocusArea'
    ? focusOptions.map((v) => ({ label: v, value: v }))
    : openFilter === 'Difficulty'
      ? BUILDER_FILTERS.Difficulty.map((v) => ({ label: v, value: v }))
      : openFilter === 'Equipment'
        ? equipmentOptions.map((v) => ({ label: v, value: v }))
        : [];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.back}>
          <Icon name="back" size={19} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Custom Workout</Text>
          <Text style={styles.subtitle}>Pick real exercises, save, and train</Text>
        </View>
      </View>

      <View style={styles.nameBox}>
        <TextInput
          value={workoutName}
          onChangeText={setWorkoutName}
          placeholder="Workout name (e.g. Morning Core)"
          placeholderTextColor={colors.textMuted}
          style={styles.nameInput}
        />
      </View>

      <ScrollView style={styles.filters} horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}>
        {(['FocusArea', 'Difficulty', 'Equipment'] as FilterKey[]).map((key) => (
          <TouchableOpacity key={key} style={styles.filterChip} onPress={() => setOpenFilter(key)}>
            <Text style={styles.filterChipLabel}>{key === 'FocusArea' ? 'Focus Area' : key}</Text>
            <Text style={styles.filterChipValue}>{filters[key]}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {!!savedWorkouts.length && (
          <View style={styles.savedSection}>
            <Text style={styles.listTitle}>YOUR SAVED WORKOUTS ({savedWorkouts.length})</Text>
            {savedWorkouts.map((cw) => (
              <View key={cw.id} style={styles.savedCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exerciseName}>{cw.name}</Text>
                  <Text style={styles.exerciseMeta}>{cw.exercises.length} exercises</Text>
                </View>
                <TouchableOpacity onPress={() => playCustom(cw.name, cw.exercises)} style={styles.playPill}>
                  <Icon name="play" size={12} color={colors.white} />
                  <Text style={styles.playPillText}>START</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteSaved(cw.id)} style={styles.delBtn}>
                  <Icon name="close" size={14} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.listTitle}>{filtered.length} EXERCISES AVAILABLE</Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 28 }} />
        ) : !filtered.length ? (
          <Text style={styles.empty}>No exercises match these filters.</Text>
        ) : (
          filtered.map((ex) => {
            const isOn = selectedIds.includes(ex.id);
            const lvl = LEVEL_NAMES[Number(ex.level || 1)] || 'Beginner';
            return (
              <TouchableOpacity key={ex.id} onPress={() => toggle(ex.id)} style={[styles.exercise, isOn && styles.exerciseOn]}>
                <View style={[styles.checkBox, isOn && styles.checkBoxOn]}>
                  {isOn && <Icon name="check" size={13} color={colors.white} />}
                </View>
                <ExerciseArt actionId={ex.action_id} uri={ex.lottie_path} size={44} glyph="◆" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.exerciseName}>{ex.name}</Text>
                  <Text style={styles.exerciseMeta}>
                    {ex.primary_muscle || 'Full body'} · {lvl}{ex.equipment && ex.equipment !== 'none' ? ` · ${ex.equipment}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancel} onPress={() => nav.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.save} onPress={save}>
          <Text style={styles.saveText}>Save Workout ({selectedIds.length})</Text>
        </TouchableOpacity>
      </View>

      <SelectModal
        visible={openFilter !== null}
        title={openFilter ? `Choose ${openFilter === 'FocusArea' ? 'Focus Area' : openFilter}` : ''}
        options={options}
        selected={openFilter ? filters[openFilter] : ''}
        onSelect={(v) => {
          if (openFilter) setFilters((f) => ({ ...f, [openFilter]: String(v) }));
          setOpenFilter(null);
        }}
        onClose={() => setOpenFilter(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  title: { ...typography.h3, color: colors.text },
  subtitle: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  nameBox: { marginHorizontal: spacing.lg, marginBottom: spacing.xs },
  nameInput: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, height: 46, color: colors.text, fontSize: 14, fontWeight: '600',
  },
  filters: { flexGrow: 0, marginTop: spacing.sm },
  filterRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: 4 },
  filterChip: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 8 },
  filterChipLabel: { ...typography.tiny, color: colors.textMuted },
  filterChipValue: { ...typography.caption, color: colors.text, fontWeight: '800', marginTop: 2 },
  list: { flex: 1, marginTop: spacing.md },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: 24 },
  listTitle: { ...typography.tiny, color: colors.textSecondary, fontWeight: '800', marginBottom: spacing.sm, letterSpacing: 0.7 },
  savedSection: { marginBottom: spacing.lg },
  savedCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#F4F7FF', borderRadius: radius.lg, borderWidth: 1, borderColor: '#D6E4FF',
    padding: spacing.md, marginBottom: spacing.sm,
  },
  playPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7,
  },
  playPillText: { color: colors.white, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  delBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFEAEA', alignItems: 'center', justifyContent: 'center' },
  exercise: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.sm, marginBottom: spacing.sm, ...shadows.card },
  exerciseOn: { borderWidth: 1.5, borderColor: colors.primary },
  checkBox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  exerciseName: { ...typography.caption, color: colors.text, fontWeight: '800' },
  exerciseMeta: { ...typography.tiny, color: colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
  empty: { ...typography.caption, color: colors.textMuted, textAlign: 'center', paddingVertical: 24 },
  footer: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.white },
  cancel: { flex: 1, height: 48, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { ...typography.bodyBold, color: colors.textSecondary },
  save: { flex: 1.4, height: 48, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  saveText: { ...typography.bodyBold, color: colors.white },
});
