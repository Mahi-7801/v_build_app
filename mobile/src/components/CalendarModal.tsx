import React from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, Animated } from 'react-native';
import { Text } from './LocalizedText';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/theme';
import { Icon } from './Icon';

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function CalendarModal({
  visible, onClose, weeklyDays = 3, firstDayOfWeek = 'SUNDAY',
}: {
  visible: boolean;
  onClose: () => void;
  weeklyDays?: number;
  firstDayOfWeek?: string;
}) {
  const pop = React.useRef(new Animated.Value(0.9)).current;
  React.useEffect(() => {
    if (visible) {
      pop.setValue(0.9);
      Animated.spring(pop, { toValue: 1, friction: 7, useNativeDriver: true }).start();
    }
  }, [visible, pop]);

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = Math.max(0, DAY_NAMES.indexOf(String(firstDayOfWeek).slice(0, 3).toUpperCase()));
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const monthName = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, { transform: [{ scale: pop }] }]}>
          <View style={styles.head}>
            <View>
              <Text style={styles.kicker}>YOUR SCHEDULE</Text>
              <Text style={styles.title}>{monthName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.close}>
              <Icon name="close" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {DAY_NAMES.map((d) => <Text key={d} style={styles.weekName}>{d.charAt(0)}</Text>)}
          </View>
          <View style={styles.grid}>
            {cells.map((day, i) => {
              if (day === null) return <View key={`e${i}`} style={styles.cell} />;
              const weekday = (firstWeekday + i) % 7;
              const training = ((weekday - startDay + 7) % 7) < weeklyDays;
              const isToday = day === today.getDate();
              return (
                <View key={day} style={styles.cell}>
                  <View style={[
                    styles.day,
                    training && styles.dayTraining,
                    isToday && styles.dayToday,
                  ]}>
                    <Text style={[
                      styles.dayText,
                      training && styles.dayTextTraining,
                      isToday && styles.dayTextToday,
                    ]}>{day}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={styles.legend}>
            <View style={styles.legendItem}><View style={[styles.dot, styles.dotTraining]} /><Text style={styles.legendText}>Training day</Text></View>
            <View style={styles.legendItem}><View style={[styles.dot, styles.dotToday]} /><Text style={styles.legendText}>Today</Text></View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.done}>
            <Text style={styles.doneText}>DONE</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,16,32,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 380, backgroundColor: colors.white, borderRadius: 22, padding: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  kicker: { ...typography.tiny, color: colors.primary, fontWeight: '800', letterSpacing: 1.2 },
  title: { ...typography.h2, color: colors.text, marginTop: 4 },
  close: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekName: { flex: 1, textAlign: 'center', color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.28%', alignItems: 'center', paddingVertical: 4 },
  day: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  dayTraining: { backgroundColor: '#DCE7FF' },
  dayToday: { backgroundColor: colors.primary },
  dayText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  dayTextTraining: { color: colors.primary },
  dayTextToday: { color: colors.white },
  legend: { flexDirection: 'row', gap: 18, marginTop: 18 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotTraining: { backgroundColor: '#DCE7FF' },
  dotToday: { backgroundColor: colors.primary },
  legendText: { color: colors.textSecondary, fontSize: 11 },
  done: { marginTop: 20, backgroundColor: colors.primary, borderRadius: radius.pill, height: 48, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: colors.white, fontWeight: '800', letterSpacing: 1 },
});
