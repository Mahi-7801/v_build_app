import * as Notifications from 'expo-notifications';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const CHANNEL_BEEP = 'workout-reminders';
const CHANNEL_VOICE = 'workout-reminders-voice';
const CHANNEL_SILENT = 'workout-reminders-silent';
const SETTINGS_KEY = '@homeworkout/settings';
let lastScheduleError = '';
let cachedRemindersList: any[] = [];
let speechListenerRegistered = false;

export function getScheduleError(): string { return lastScheduleError; }
export function getCachedReminders(): any[] { return cachedRemindersList; }

export async function canScheduleExactAlarms(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    if (typeof Notifications.getExactAlarmPermissionsAsync === 'function') {
      const res = await Notifications.getExactAlarmPermissionsAsync();
      return !!res?.granted;
    }
  } catch { /* older Android / unavailable */ }
  return true;
}

export async function requestExactAlarms(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    if (typeof Notifications.requestExactAlarmPermissionsAsync === 'function') {
      const res = await Notifications.requestExactAlarmPermissionsAsync();
      return !!res?.granted;
    }
  } catch (e: any) {
    lastScheduleError = String(e?.message || e);
  }
  return await canScheduleExactAlarms();
}

/** "Sound options" in Workout settings: beep (default), voice, or silent. */
export async function getReminderSound(): Promise<'beep' | 'voice' | 'silent'> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    const value = String(raw ? (JSON.parse(raw).countdown_sound || 'beep') : 'beep');
    return value === 'voice' || value === 'silent' ? value : 'beep';
  } catch {
    return 'beep';
  }
}

function channelFor(sound: 'beep' | 'voice' | 'silent') {
  if (sound === 'silent') return CHANNEL_SILENT;
  if (sound === 'voice') return CHANNEL_VOICE;
  return CHANNEL_BEEP;
}

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch (e) {
  console.warn('[notifications] setNotificationHandler error', e);
}

async function createChannel(id: string, sound: 'beep' | 'voice' | 'silent') {
  if (Platform.OS !== 'android') return;
  const silent = sound === 'silent';
  await Notifications.setNotificationChannelAsync(id, {
    name: silent ? 'Workout reminders (silent)' : `Workout reminders (${sound})`,
    description: silent ? 'Quiet workout reminders' : 'Alarm-style workout reminders',
    importance: silent ? Notifications.AndroidImportance.LOW : Notifications.AndroidImportance.MAX,
    sound: silent ? undefined : 'default',
    enableVibrate: !silent,
    vibrationPattern: silent ? undefined : [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

async function createChannels() {
  await createChannel(CHANNEL_BEEP, 'beep');
  await createChannel(CHANNEL_VOICE, 'voice');
  await createChannel(CHANNEL_SILENT, 'silent');
}

export type NotificationCheck = { ok: boolean; status: string; reason?: string };

/** Detailed permission check — used for diagnostics in the reminder screen. */
export async function checkNotifications(): Promise<NotificationCheck> {
  // A channel problem must NOT be reported as a permission problem.
  try {
    await createChannels();
  } catch (e: any) {
    console.warn('[reminders] channel setup failed', e);
  }

  let status = 'unknown';
  try {
    let current = await Notifications.getPermissionsAsync();
    status = String(current.status);
    const isGranted = (s: any) => !!s?.granted || s?.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!isGranted(current)) {
      const asked = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      current = asked;
      status = String(asked.status);
    }
    return { ok: isGranted(current), status };
  } catch (e: any) {
    const reason = String(e?.message || e);
    console.warn('[reminders] permission check failed', e);
    return { ok: false, status, reason };
  }
}

/** Make sure permission is granted and the loud channel exists before scheduling. */
export async function ensureNotifications(): Promise<boolean> {
  return (await checkNotifications()).ok;
}

export async function setupNotifications() {
  await ensureNotifications();
  if (!speechListenerRegistered) {
    speechListenerRegistered = true;
    Notifications.addNotificationReceivedListener(async () => {
      try {
        if (await getReminderSound() === 'voice') {
          await Speech.speak('It is time to train. Your workout is ready!', { language: 'en', rate: 1 });
        }
      } catch { /* voice is best-effort */ }
    });
  }
}

/** Accepts HH:MM, HH:MM:SS, or a Date/string variant from the API. */
export function parseTimeOfDay(raw: any): { hour: number; minute: number } | null {
  const parts = String(raw || '').trim().split(':');
  if (parts.length < 2) return null;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function parseDays(raw: any): number[] {
  if (Array.isArray(raw)) return raw.map(Number);
  if (typeof raw === 'string') {
    try { return JSON.parse(raw).map(Number); } catch { return []; }
  }
  return [];
}

function reminderContent(title?: string, sound: 'beep' | 'voice' | 'silent' = 'beep') {
  return {
    title: title || 'Workout reminder',
    body: sound === 'silent' ? 'Quiet reminder — it’s time to train!' : 'It’s time to train — your workout is ready!',
    sound: sound === 'silent' ? false : ('default' as const),
  };
}

async function scheduleWithDelivery(request: {
  identifier: string;
  content: Notifications.NotificationContentInput;
  trigger:
    | Omit<Notifications.DailyTriggerInput, 'delivery'>
    | Omit<Notifications.WeeklyTriggerInput, 'delivery'>;
}) {
  const exact = await canScheduleExactAlarms();
  if (exact) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: request.identifier,
        content: request.content,
        trigger: { ...request.trigger, delivery: 'alarmClock' },
      });
      return;
    } catch {
      // Fallback to bestEffort when Android denies exact AlarmManager clock permission.
    }
  }
  await Notifications.scheduleNotificationAsync({
    identifier: request.identifier,
    content: request.content,
    trigger: { ...request.trigger, delivery: 'bestEffort' },
  });
}

/**
 * Convert stored days (0..6 with 0=Sun from ReminderModal OR 1..7 ISO with 7=Sun)
 * to unique Expo/Java Calendar weekdays (1=Sunday .. 7=Saturday).
 */
function toExpoWeekdays(rawDays: number[]): number[] {
  const src = rawDays.length ? rawDays : [0, 1, 2, 3, 4, 5, 6];
  const out = new Set<number>();
  for (const d of src) {
    if (!Number.isFinite(d)) continue;
    const mod = ((Math.trunc(d) % 7) + 7) % 7;
    out.add(mod + 1);
  }
  return Array.from(out).sort((a, b) => a - b);
}

/** Schedule one repeating alarm per selected weekday (or one daily alarm). */
export async function scheduleReminder(r: any) {
  const parsed = parseTimeOfDay(r.time_of_day);
  if (!parsed) return;
  const { hour, minute } = parsed;

  const days = parseDays(r.days_of_week);
  const expoWeekdays = toExpoWeekdays(days);
  const sound = await getReminderSound();
  const channelId = channelFor(sound);

  if (expoWeekdays.length === 7) {
    await scheduleWithDelivery({
      identifier: `reminder-${r.id}-daily-${sound}`,
      content: reminderContent(r.title, sound),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        channelId,
        hour,
        minute,
      },
    });
    return;
  }

  for (const weekday of expoWeekdays) {
    await scheduleWithDelivery({
      // Expo WeeklyTriggerInput works on both Android & iOS (1=Sunday .. 7=Saturday).
      identifier: `reminder-${r.id}-w${weekday}-${sound}`,
      content: reminderContent(r.title, sound),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        channelId,
        hour,
        minute,
        weekday,
      },
    });
  }
}

/** Rebuild all device alarms from the server list. Returns true on success. */
export async function syncReminders(list: any[]): Promise<boolean> {
  cachedRemindersList = Array.isArray(list) ? list : [];
  // Even if the permission probe is wrong, still try to schedule — the OS is
  // the final authority and scheduledReminderCount() reports what really stuck.
  const allowed = await ensureNotifications();
  lastScheduleError = '';
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e: any) {
    lastScheduleError = String(e?.message || e);
    console.warn('[reminders] could not clear old alarms', e);
  }
  for (const r of cachedRemindersList) {
    if (r.enabled === false || Number(r.enabled) === 0) continue;
    try {
      await scheduleReminder(r);
    } catch (e: any) {
      lastScheduleError = String(e?.message || e);
      console.warn('[reminders] failed to schedule one reminder', e);
    }
  }
  return allowed;
}

export async function scheduledReminderCount(): Promise<number> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    return all.length;
  } catch {
    return 0;
  }
}

/** Fire a notification in 2 seconds so the user can confirm sound/vibration. */
export async function testNotification(): Promise<boolean> {
  try {
    await checkNotifications();
    const sound = await getReminderSound();
    await Notifications.scheduleNotificationAsync({
      content: reminderContent('Reminder sound test', sound),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        channelId: channelFor(sound),
        seconds: 2,
        repeats: false,
      },
    });
    return true;
  } catch (e) {
    console.warn('[reminders] test notification failed', e);
    return false;
  }
}

/** Show a notification immediately (used by the due-time fallback and test). */
export async function notifyNow(title?: string): Promise<boolean> {
  try {
    await checkNotifications();
    const sound = await getReminderSound();
    await Notifications.scheduleNotificationAsync({
      content: reminderContent(title, sound),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        channelId: channelFor(sound),
        seconds: 1,
        repeats: false,
      },
    });
    return true;
  } catch (e) {
    console.warn('[reminders] immediate notification failed', e);
    return false;
  }
}

/**
 * Fallback for devices where an exact-minute OS alarm is missed: when the app
 * is open or resumes on the reminder minute, fire it once per date (returns fired IDs).
 */
export async function checkDueReminders(list: any[]): Promise<number[]> {
  const firedIds: number[] = [];
  try {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const expoToday = now.getDay() + 1; // 1=Sunday .. 7=Saturday

    for (const r of list) {
      if (!r || r.enabled === false || Number(r.enabled) === 0) continue;
      const t = parseTimeOfDay(r.time_of_day);
      if (!t || `${pad(t.hour)}:${pad(t.minute)}` !== hhmm) continue;
      const days = toExpoWeekdays(parseDays(r.days_of_week));
      if (!days.includes(expoToday)) continue;

      const key = `@homeworkout/reminder-fired-${today}-${hhmm}-${r.id}`;
      if (await AsyncStorage.getItem(key)) continue;
      await AsyncStorage.setItem(key, '1');
      if (await notifyNow(r.title)) {
        if (r.id) firedIds.push(Number(r.id));
      }
    }
  } catch { /* non-fatal */ }
  return firedIds;
}

export async function cancelReminderIds(ids: number[]) {
  try {
    for (const id of ids) {
      for (const sound of ['beep', 'voice', 'silent']) {
        await Notifications.cancelScheduledNotificationAsync(`reminder-${id}-daily-${sound}`).catch(() => {});
        for (let d = 0; d <= 7; d++) {
          await Notifications.cancelScheduledNotificationAsync(`reminder-${id}-${d}-${sound}`).catch(() => {});
          await Notifications.cancelScheduledNotificationAsync(`reminder-${id}-w${d}-${sound}`).catch(() => {});
        }
      }
    }
  } catch { /* ignore */ }
}
