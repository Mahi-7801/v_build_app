import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text } from '../components/LocalizedText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors } from '../theme/colors';
import { radius, spacing, typography, shadows } from '../theme/theme';
import { Icon } from '../components/Icon';
import { ExerciseArt } from '../components/ExerciseArt';
import { exercisesApi } from '../api/client';

type Props = NativeStackScreenProps<RootStackParamList, 'ExerciseDetail'>;

export default function ExerciseDetailScreen({ route }: Props) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { exerciseId, actionId, name } = route.params || {};
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (exerciseId || actionId) {
      exercisesApi.detail(exerciseId || actionId!)
        .then((r) => setData(r.data))
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [exerciseId, actionId]);

  const exercise = data?.exercise || {};
  const parseList = (v: any): any[] => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') {
      try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
    }
    return [];
  };
  const steps = parseList(exercise.steps);
  const coachTips = parseList(exercise.coach_tips);
  const tips = data?.tips || [];
  const mergedTips = tips.length ? tips : coachTips.map((t: any) => ({ content: typeof t === 'string' ? t : t.content || t.text || '' })).filter((t: any) => !!t.content);
  const title = exercise.name || exercise.title || name || 'Exercise';

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.iconBtn}>
          <Icon name="back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Exercise detail</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <ExerciseArt actionId={exercise.action_id || actionId} uri={exercise.lottie_path} size={180} />
            <View style={styles.unitBadge}>
              <Icon name="clock" size={13} color={colors.white} />
              <Text style={styles.unitText}>timed</Text>
            </View>
          </View>

          <Text style={styles.title}>{title}</Text>
          {!!(exercise.description || exercise.introduce) && (
            <Text style={styles.desc}>{exercise.description || exercise.introduce}</Text>
          )}

          <View style={styles.facts}>
            <Fact label="Level" value={`${exercise.level || 1}`} />
            <Fact label="Muscle" value={exercise.primary_muscle || 'full body'} />
            <Fact label="Equipment" value={exercise.equipment || 'none'} />
          </View>

          {steps.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>How to do it</Text>
              {steps.map((s: any, i: number) => (
                <View key={i} style={styles.step}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                  <Text style={styles.stepText}>{typeof s === 'string' ? s : s.text || s.title || ''}</Text>
                </View>
              ))}
            </View>
          )}

          {mergedTips.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Coach tips</Text>
              {mergedTips.map((t: any, i: number) => (
                <View key={i} style={styles.tip}>
                  <Icon name="info" size={17} color={colors.primary} />
                  <Text style={styles.tipText}>{t.content || t.title || ''}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={[styles.fact, shadows.card]}>
      <Text style={styles.factValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  headerTitle: { ...typography.h3, color: colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, paddingBottom: 30 },
  hero: { height: 200, borderRadius: radius.xl, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', ...shadows.button },
  glyph: { fontSize: 90, color: 'rgba(255,255,255,0.85)', fontWeight: '300' },
  unitBadge: { position: 'absolute', bottom: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  unitText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  title: { ...typography.h1, color: colors.text, marginTop: spacing.xl },
  desc: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  facts: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  fact: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  factValue: { ...typography.bodyBold, color: colors.text, textTransform: 'capitalize' },
  factLabel: { ...typography.tiny, color: colors.textSecondary, textTransform: 'uppercase', marginTop: 4 },
  block: { marginTop: spacing.xxl },
  blockTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#EAF0FF', alignItems: 'center', justifyContent: 'center' },
  stepNumText: { ...typography.tiny, color: colors.primary, fontWeight: '800' },
  stepText: { flex: 1, ...typography.body, color: colors.textSecondary },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: '#F4F7FF', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  tipText: { flex: 1, ...typography.body, color: colors.textSecondary },
});
