import React, { useEffect, useState } from 'react';
import {
  View, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { Text } from './LocalizedText';
import { colors } from '../theme/colors';
import { radius, spacing, typography } from '../theme/theme';
import { Icon } from './Icon';
import { TimePickerModal } from './TimePickerModal';
import { remindersApi, clearApiCache } from '../api/client';
import {
  syncReminders, cancelReminderIds, scheduledReminderCount, testNotification, checkNotifications,
  getScheduleError, canScheduleExactAlarms, requestExactAlarms, type NotificationCheck,
} from '../notifications';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** PRO benefit: create/manage daily workout reminders. */
export function ReminderModal({
  visible, onClose,
}: { visible: boolean; onClose: () => void }) {
  const [time, setTime] = useState('07:00');
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [list, setList] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [alarms, setAlarms] = useState(0);
  const [exactOk, setExactOk] = useState(true);

  const load = React.useCallback(async () => {
    try {
      const r = await remindersApi.list();
      const items = r.data.reminders || [];
      setList(items);
      const ok = await syncReminders(items);
      setAlarms(await scheduledReminderCount());
      setExactOk(await canScheduleExactAlarms());
      return ok;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  /** Only call this "blocked" when permission is genuinely denied. */
  const notifyProblem = async (given?: NotificationCheck) => {
    const check = given || await checkNotifications();
    if (check.ok) {
      Alert.alert(
        'Alarm not kept by device',
        `Notifications are allowed (status: ${check.status}), but this device did not keep the alarm.${getScheduleError() ? `\nError: ${getScheduleError()}` : ''}\n\nTap TEST SOUND to verify, then save again.`
      );
      return;
    }
    Alert.alert(
      'Notifications blocked',
      `Status: ${check.status}${check.reason ? `\n${check.reason}` : ''}\n\nAllow notifications for this app in your phone Settings, then reopen this screen.`,
      [
        { text: 'Cancel' },
        { text: 'Open Settings', onPress: () => { Linking.openSettings().catch(() => {}); } },
      ]
    );
  };

  const save = async () => {
    if (!/^\d{2}:\d{2}$/.test(time)) return;
    setBusy(true);
    try {
      await remindersApi.create({ title: 'Workout reminder', timeOfDay: time, daysOfWeek: days });
      clearApiCache();
      await load();
      const check = await checkNotifications();
      const count = await scheduledReminderCount();
      // Save always succeeds once the server accepted it. Scheduled count is
      // informational only — never call it a permission problem when status is granted.
      onClose();
      if (!check.ok) {
        await notifyProblem(check);
      } else {
        Alert.alert(
          'Reminder saved',
          count > 0
            ? `${time} saved. ${count} reminder schedule(s) active.`
            : `${time} saved. Tap TEST SOUND to verify notifications on this device.`
        );
      }
    } catch {
      Alert.alert('Could not save', 'Check your connection and try again.');
    }
    finally { setBusy(false); }
  };

  const test = async () => {
    const ok = await testNotification();
    if (ok) {
      Alert.alert('Test sent', 'You should see and hear the reminder in about 2 seconds. Close this screen to hear it.');
    } else {
      await notifyProblem();
    }
  };

  return (
    <>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.head}>
            <View>
              <Text style={styles.kicker}>SMART REMINDERS</Text>
              <Text style={styles.title}>Workout reminder</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.close}>
              <Icon name="close" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Time of day</Text>
          <TouchableOpacity style={styles.timeBox} onPress={() => setPickerOpen(true)}>
            <Icon name="clock" size={20} color={colors.primary} />
            <Text style={styles.timeValue}>{time}</Text>
            <Text style={styles.timeHint}>Tap to set clock</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Repeat on</Text>
          <View style={styles.days}>
            {DAYS.map((d, i) => {
              const on = days.includes(i);
              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => setDays(on ? days.filter((x) => x !== i) : [...days, i])}
                  style={[styles.day, on && styles.dayOn]}
                >
                  <Text style={[styles.dayText, on && styles.dayTextOn]}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {list.length > 0 && (
            <View style={styles.existing}>
              <Text style={styles.label}>Active reminders</Text>
              {list.map((r) => (
                <View key={r.id} style={styles.reminderRow}>
                  <Text style={styles.reminderText}>{r.time_of_day}</Text>
                  <TouchableOpacity onPress={async () => {
                    await remindersApi.remove(r.id);
                    clearApiCache();
                    await cancelReminderIds([r.id]);
                    await load();
                  }}>
                    <Icon name="close" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <View style={styles.statusRow}>
            <Text style={[styles.status, alarms === 0 && styles.statusBad]}>
              {alarms > 0 ? `${alarms} reminder(s) active on this device` : 'No reminders scheduled'}
            </Text>
            <TouchableOpacity onPress={test} style={styles.testBtn}>
              <Icon name="bell" size={14} color={colors.primary} />
              <Text style={styles.testText}>TEST SOUND</Text>
            </TouchableOpacity>
          </View>
          {!exactOk && (
            <TouchableOpacity
              onPress={async () => {
                await requestExactAlarms();
                await load();
              }}
              style={styles.exactWarn}
            >
              <Icon name="clock" size={14} color="#B45309" />
              <Text style={styles.exactWarnText}>Tap to allow exact reminder timing in phone settings if notifications arrive late.</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={save} disabled={busy || !/^\d{2}:\d{2}$/.test(time)} style={styles.save}>
            {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveText}>SAVE REMINDER</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    <TimePickerModal
      visible={pickerOpen}
      initialTime={time}
      onClose={() => setPickerOpen(false)}
      onConfirm={(t) => { setTime(t); setPickerOpen(false); }}
    />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,16,32,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 380, backgroundColor: colors.white, borderRadius: 22, padding: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  kicker: { ...typography.tiny, color: colors.primary, fontWeight: '900', letterSpacing: 1.2 },
  title: { ...typography.h3, color: colors.text, marginTop: 3 },
  close: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  label: { ...typography.caption, color: colors.textSecondary, fontWeight: '800', marginTop: 10, marginBottom: 6 },
  timeBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 52,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary,
    backgroundColor: '#EAF0FF', paddingHorizontal: 14,
  },
  timeValue: { fontSize: 22, fontWeight: '900', color: colors.text },
  timeHint: { ...typography.tiny, color: colors.textSecondary, marginLeft: 'auto' },
  days: { flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
  day: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  dayOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: { color: colors.textSecondary, fontWeight: '800', fontSize: 12 },
  dayTextOn: { color: colors.white },
  existing: { marginTop: 14 },
  reminderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border },
  reminderText: { ...typography.bodyBold, color: colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  status: { ...typography.tiny, color: colors.textMuted },
  statusBad: { color: colors.danger, fontWeight: '800' },
  exactWarn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10,
    backgroundColor: '#FEF3C7', borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8,
  },
  exactWarnText: { flex: 1, fontSize: 11, color: '#92400E', fontWeight: '700' },
  testBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: '#EAF0FF' },
  testText: { fontSize: 10, fontWeight: '900', color: colors.primary, letterSpacing: 0.6 },
  save: { height: 46, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  saveText: { color: colors.white, fontWeight: '900', letterSpacing: 1 },
});
