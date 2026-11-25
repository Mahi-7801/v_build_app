import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Text } from '../components/LocalizedText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { radius, spacing, typography, shadows } from '../theme/theme';
import { Icon } from '../components/Icon';
import { SelectModal, type SelectOption } from '../components/SelectModal';
import { JUST_FOR_YOU, RECOMMENDED, STRETCH_WORKOUTS, BUILDER_FILTERS, TOTAL_EXERCISES } from '../data/fitnessCatalog';

type FilterKey = keyof typeof BUILDER_FILTERS;

const EXERCISES = [...RECOMMENDED.slice(0, 4), ...JUST_FOR_YOU, ...STRETCH_WORKOUTS.slice(0, 4)];

export default function CustomWorkoutBuilderScreen() {
  const nav = useNavigation<any>();
  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    FocusArea: 'All Areas',
    Difficulty: 'All Levels',
    Type: 'All Types',
    Equipment: 'All Equipment',
  });
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null);
  const [selected, setSelected] = useState<number[]>([]);

  const toggle = (i: number) => setSelected((prev) =>
    prev.includes(i) ? prev.filter((n) => n !== i) : [...prev, i]);

  const save = () => {
    if (!selected.length) {
      Alert.alert('No exercises', 'Pick at least one exercise before saving.');
      return;
    }
    Alert.alert('Workout saved', `${selected.length} exercise${selected.length === 1 ? '' : 's'} added to your custom workout.`, [
      { text: 'OK', onPress: () => nav.goBack() },
    ]);
  };

  const options: SelectOption[] = openFilter
    ? BUILDER_FILTERS[openFilter].map((v) => ({ label: v, value: v }))
    : [];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.back}>
          <Icon name="back" size={19} color={colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Add Exercises</Text>
          <Text style={styles.subtitle}>Build your own workout</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.summary} onPress={() => setOpenFilter('FocusArea')}>
        <View style={styles.summaryLeft}>
          <Icon name="filter" size={17} color={colors.primary} />
          <Text style={styles.summaryLabel}>Filter</Text>
          <Text style={styles.summaryArrow}>→</Text>
          <Text style={styles.summaryValue}>{filters.FocusArea} ({TOTAL_EXERCISES})</Text>
        </View>
        <Icon name="chevron" size={15} color={colors.textMuted} />
      </TouchableOpacity>

      <ScrollView style={styles.filters} horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}>
        {(Object.keys(BUILDER_FILTERS) as FilterKey[]).map((key) => (
          <TouchableOpacity key={key} style={styles.filterChip} onPress={() => setOpenFilter(key)}>
            <Text style={styles.filterChipLabel}>{key}</Text>
            <Text style={styles.filterChipValue}>{filters[key]}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        <Text style={styles.listTitle}>{EXERCISES.length} exercises available</Text>
        {EXERCISES.map((ex, i) => {
          const isOn = selected.includes(i);
          return (
            <TouchableOpacity key={`${ex.name}-${i}`} onPress={() => toggle(i)} style={[styles.exercise, isOn && styles.exerciseOn]}>
              <View style={[styles.checkBox, isOn && styles.checkBoxOn]}>
                {isOn && <Icon name="check" size={13} color={colors.white} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.exerciseName}>{ex.name}</Text>
                <Text style={styles.exerciseMeta}>{ex.meta}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancel} onPress={() => nav.goBack()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.save} onPress={save}>
          <Text style={styles.saveText}>Save ({selected.length})</Text>
        </TouchableOpacity>
      </View>

      <SelectModal visible={openFilter !== null}
        title={openFilter ? `Choose ${openFilter}` : ''}
        options={options}
        selected={openFilter ? filters[openFilter] : ''}
        onSelect={(v) => {
          if (openFilter) setFilters((f) => ({ ...f, [openFilter]: String(v) }));
          setOpenFilter(null);
        }}
        onClose={() => setOpenFilter(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  title: { ...typography.h3, color: colors.text },
  subtitle: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  summary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: spacing.lg, backgroundColor: colors.white,
    borderRadius: radius.lg, padding: spacing.md, ...shadows.card,
  },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  summaryLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  summaryArrow: { color: colors.textMuted, fontWeight: '800' },
  summaryValue: { ...typography.caption, color: colors.primary, fontWeight: '900' },
  filters: { flexGrow: 0, marginTop: spacing.md },
  filterRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: 4 },
  filterChip: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 8 },
  filterChipLabel: { ...typography.tiny, color: colors.textMuted },
  filterChipValue: { ...typography.caption, color: colors.text, fontWeight: '800', marginTop: 2 },
  list: { flex: 1, marginTop: spacing.md },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: 20 },
  listTitle: { ...typography.tiny, color: colors.textSecondary, fontWeight: '800', marginBottom: spacing.sm },
  exercise: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, ...shadows.card },
  exerciseOn: { borderWidth: 1.5, borderColor: colors.primary },
  checkBox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  exerciseName: { ...typography.caption, color: colors.text, fontWeight: '800' },
  exerciseMeta: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  footer: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.white },
  cancel: { flex: 1, height: 48, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { ...typography.bodyBold, color: colors.textSecondary },
  save: { flex: 1.4, height: 48, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  saveText: { ...typography.bodyBold, color: colors.white },
});
