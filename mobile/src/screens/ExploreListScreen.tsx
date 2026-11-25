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
import { WorkoutCard } from '../components/WorkoutCard';
import { exploreApi } from '../api/client';

type Props = NativeStackScreenProps<RootStackParamList, 'ExploreList'>;

export default function ExploreListScreen({ route }: Props) {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { listId, title } = route.params;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    exploreApi.list(listId).then((r) => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [listId]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.iconBtn}>
          <Icon name="back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.listName}>{data?.list?.name || title}</Text>
          {!!data?.list?.description && <Text style={styles.desc}>{data.list.description}</Text>}
          <View style={styles.grid}>
            {(data?.workouts || []).map((w: any, i: number) => (
              <WorkoutCard
                key={w.id}
                workout={{ ...w, name: w.name, description: w.description, minutes: w.minutes, minutesLabel: undefined } as any}
                index={i}
                onPress={() => nav.navigate('WorkoutDetail', { workoutId: w.id, planCode: w.planCode })}
              />
            ))}
          </View>
          {!data?.workouts?.length && <Text style={styles.empty}>Workouts coming soon.</Text>}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  title: { ...typography.h3, color: colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg },
  listName: { ...typography.h1, color: colors.text, marginBottom: spacing.sm },
  desc: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  empty: { ...typography.body, color: colors.textMuted, marginTop: spacing.xl },
});
