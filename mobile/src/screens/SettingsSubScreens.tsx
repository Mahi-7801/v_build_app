import React, { useState } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert,
} from 'react-native';
import { Text } from '../components/LocalizedText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { radius, spacing, typography, shadows } from '../theme/theme';
import { Icon, IconName } from '../components/Icon';
import { SelectModal, type SelectOption } from '../components/SelectModal';
import { ReminderModal } from '../components/ReminderModal';
import { useAppStore } from '../store/useAppStore';
import { apiMessage, clearApiCache, plansApi, usersApi } from '../api/client';

function SubHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const nav = useNavigation<any>();
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => nav.goBack()} style={styles.back}>
        <Icon name="back" size={19} color={colors.text} />
      </TouchableOpacity>
      <View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function Row({ icon, label, value, onPress }: { icon: IconName; label: string; value?: string; onPress?: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.row} activeOpacity={onPress ? 0.7 : 1}>
      <View style={styles.rowIcon}><Icon name={icon} size={17} color={colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!value && <Text style={styles.rowValue}>{value}</Text>}
      </View>
      {!!onPress && <Icon name="chevron" size={15} color={colors.textMuted} />}
    </TouchableOpacity>
  );
}

function ToggleRow({ icon, label, value, onChange }: { icon: IconName; label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}><Icon name={icon} size={17} color={colors.primary} /></View>
      <View style={{ flex: 1 }}><Text style={styles.rowLabel}>{label}</Text></View>
      <Switch value={value} onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }} thumbColor={colors.white} />
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

/* -------------------------- Workout settings ---------------------------- */
type WorkoutKey = 'Gender' | 'Music' | 'Reps / time mode' | 'Rest timer' | 'Prep timer' | 'Sound options';

export function WorkoutSettingsScreen() {
  const nav = useNavigation<any>();
  const { settings, updateSettings, user, bumpCatalog, refreshUser } = useAppStore();
  const [key, setKey] = useState<WorkoutKey | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const sound = String(settings.countdown_sound || 'beep');
  const values: Record<WorkoutKey, string> = {
    Gender: String(settings.gender || 'male'),
    Music: settings.sound_enabled === false ? 'Off' : 'On',
    'Reps / time mode': settings.exercise_mode === 'time' ? 'Time' : 'Reps',
    'Rest timer': `${Number(settings.rest_seconds || 60)} seconds`,
    'Prep timer': `${Number(settings.prep_seconds || 10)} seconds`,
    'Sound options': sound === 'silent' ? 'Silent' : sound === 'voice' ? 'Voice' : 'Beep',
  };

  const optionsFor = (k: WorkoutKey): SelectOption[] => {
    const list = (items: string[]) => items.map((v) => ({ label: v, value: v }));
    if (k === 'Gender') return list(['male', 'female', 'other']);
    if (k === 'Music') return list(['On', 'Off']);
    if (k === 'Reps / time mode') return list(['Reps', 'Time']);
    if (k === 'Rest timer') return list(['30 seconds', '60 seconds', '90 seconds']);
    if (k === 'Prep timer') return list(['5 seconds', '10 seconds', '20 seconds']);
    return list(['Beep', 'Voice', 'Silent']);
  };

  const apply = (k: WorkoutKey, value: string | number) => {
    const v = String(value);
    switch (k) {
      case 'Gender': updateSettings({ gender: v }); break;
      case 'Music': updateSettings({ sound_enabled: v === 'On' }); break;
      case 'Reps / time mode': updateSettings({ exercise_mode: v.toLowerCase() }); break;
      case 'Rest timer': updateSettings({ rest_seconds: parseInt(v, 10) }); break;
      case 'Prep timer': updateSettings({ prep_seconds: parseInt(v, 10) }); break;
      case 'Sound options': updateSettings({ countdown_sound: v.toLowerCase() }); break;
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SubHeader title="Workout settings" subtitle="Tune your training session" />
        <Group title="SESSION">
          <Row icon="user" label="Gender" value={values.Gender} onPress={() => setKey('Gender')} />
          <Row icon="smile" label="Music" value={values.Music} onPress={() => setKey('Music')} />
          <Row icon="dumbbell" label="Reps / time mode" value={values['Reps / time mode']} onPress={() => setKey('Reps / time mode')} />
          <Row icon="clock" label="Rest timer" value={values['Rest timer']} onPress={() => setKey('Rest timer')} />
          <Row icon="clock" label="Prep timer" value={values['Prep timer']} onPress={() => setKey('Prep timer')} />
          <Row icon="bell" label="Reminder sound" value={values['Sound options']} onPress={() => setKey('Sound options')} />
          <Row icon={user?.is_pro ? 'bell' : 'lock'} label="Workout reminder"
            value={user?.is_pro ? 'Set time' : 'Locked · PRO'}
            onPress={() => user?.is_pro ? setReminderOpen(true) : nav.navigate('Pro')} />
        </Group>
        <Group title="DANGER ZONE">
          <Row
            icon="info"
            label={resetBusy ? 'Restarting progress…' : 'Restart progress'}
            onPress={() => Alert.alert('Restart progress',
              'This resets completed days and streaks. Continue?', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Restart',
                  style: 'destructive',
                  onPress: async () => {
                    if (!user) {
                      Alert.alert('Sign in required', 'Sign in first to reset your saved progress.');
                      return;
                    }
                    setResetBusy(true);
                    try {
                      await plansApi.resetProgress();
                      clearApiCache();
                      bumpCatalog();
                      await refreshUser();
                      Alert.alert('Progress restarted', 'Your workout plans and streaks have been reset.', [
                        { text: 'OK', onPress: () => nav.goBack() },
                      ]);
                    } catch (e) {
                      Alert.alert('Could not reset', apiMessage(e));
                    } finally {
                      setResetBusy(false);
                    }
                  },
                },
              ])}
          />
        </Group>
      </ScrollView>
      <SelectModal visible={key !== null} title={key || ''} options={key ? optionsFor(key) : []}
        selected={key ? values[key] : ''}
        onSelect={(v) => { if (key) apply(key, v); setKey(null); }}
        onClose={() => setKey(null)} />
      <ReminderModal visible={reminderOpen} onClose={() => setReminderOpen(false)} />
    </SafeAreaView>
  );
}

/* -------------------------- General settings ---------------------------- */
export function GeneralSettingsScreen() {
  const { settings, updateSettings, user } = useAppStore();
  const nav = useNavigation<any>();
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SubHeader title="General settings" subtitle="App-wide preferences" />
        <Group title="PREFERENCES">
          <Row icon={user?.is_pro ? 'bell' : 'lock'} label="Remind me to work out every day"
            value={user?.is_pro ? 'Set time' : 'Locked · PRO'}
            onPress={() => user?.is_pro ? setReminderOpen(true) : nav.navigate('Pro')} />
          <Row icon="scale" label="Metric & Imperial units"
            value={settings.units === 'imperial' ? 'Imperial' : 'Metric'} onPress={() => setUnitsOpen(true)} />
          <ToggleRow icon="play" label="Keep the screen on"
            value={!!settings.keep_screen_on}
            onChange={(v) => updateSettings({ keep_screen_on: v } as any)} />
        </Group>
        <Group title="ABOUT">
          <Row icon="info" label="Privacy policy" onPress={() => Alert.alert('Privacy policy',
            'Your workout data stays on this device and on your own server. No third-party tracking.')} />
        </Group>
      </ScrollView>
      <SelectModal visible={unitsOpen} title="Units"
        options={[{ label: 'Metric (kg / cm)', value: 'metric' }, { label: 'Imperial (lbs / in)', value: 'imperial' }]}
        selected={settings.units || 'metric'}
        onSelect={(v) => { updateSettings({ units: String(v) } as any); setUnitsOpen(false); }}
        onClose={() => setUnitsOpen(false)} />
      <ReminderModal visible={reminderOpen} onClose={() => setReminderOpen(false)} />
    </SafeAreaView>
  );
}

/* --------------------------- Voice options ------------------------------ */
export function VoiceOptionsScreen() {
  const { settings, updateSettings } = useAppStore();
  const [choice, setChoice] = useState(settings.voice_enabled === false ? 'device' : 'natural');
  const options = [
    { key: 'natural', label: 'Natural voice', sub: 'Advanced & more fluid voice' },
    { key: 'device', label: 'Device TTS Engine', sub: 'Use the voice installed on your phone' },
  ];
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SubHeader title="Voice options (TTS)" subtitle="Choose your coaching voice" />
        <Group title="VOICE ENGINE">
          {options.map((o) => (
            <TouchableOpacity key={o.key} style={styles.row} onPress={() => {
              setChoice(o.key);
              updateSettings({ voice_enabled: o.key === 'natural' } as any);
            }}>
              <View style={[styles.radio, choice === o.key && styles.radioOn]}>
                {choice === o.key && <View style={styles.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{o.label}</Text>
                <Text style={styles.rowValue}>{o.sub}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </Group>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------ Suggest other features ------------------------ */
const FEATURES = ['Edit exercise', 'Background music', 'Add warm-up', 'Add cool-down',
  'More exercises', 'More languages', 'Favourite list', 'Others'];

export function SuggestFeaturesScreen() {
  const nav = useNavigation<any>();
  const user = useAppStore((s) => s.user);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toggle = (f: string) => setPicked((p) => p.includes(f) ? p.filter((x) => x !== f) : [...p, f]);
  const submit = async () => {
    if (!picked.length) { Alert.alert('Nothing selected', 'Pick at least one feature.'); return; }
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in so we can save your suggestion.');
      return;
    }
    setBusy(true);
    try {
      await usersApi.submitFeedback({ features: picked });
      Alert.alert('Thanks!', `Saved your feedback: ${picked.join(', ')}`, [{ text: 'OK', onPress: () => nav.goBack() }]);
    } catch (e) {
      Alert.alert('Could not submit', apiMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SubHeader title="Suggest other features" subtitle="Help us build what you need" />
        <View style={styles.prompt}>
          <Text style={styles.promptTitle}>What other features you'd like to add?</Text>
          <Text style={styles.promptSub}>Select all that apply.</Text>
        </View>
        <View style={styles.featureGrid}>
          {FEATURES.map((f) => (
            <TouchableOpacity key={f} onPress={() => toggle(f)}
              style={[styles.featureChip, picked.includes(f) && styles.featureChipOn]}>
              <View style={[styles.checkBox, picked.includes(f) && styles.checkBoxOn]}>
                {picked.includes(f) && <Icon name="check" size={12} color={colors.white} />}
              </View>
              <Text style={[styles.featureText, picked.includes(f) && styles.featureTextOn]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={[styles.submit, busy && { opacity: 0.6 }]} disabled={busy} onPress={submit}>
          <Text style={styles.submitText}>{busy ? 'Submitting…' : 'Submit'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  back: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadows.card },
  title: { ...typography.h3, color: colors.text },
  subtitle: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  group: { marginTop: spacing.lg, paddingHorizontal: spacing.lg },
  groupTitle: { ...typography.caption, color: colors.textSecondary, fontWeight: '800', letterSpacing: 1, marginBottom: spacing.sm, marginLeft: 4 },
  card: { backgroundColor: colors.white, borderRadius: radius.xl, overflow: 'hidden', ...shadows.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#EDF3FF', alignItems: 'center', justifyContent: 'center' },
  rowLabel: { ...typography.caption, color: colors.text, fontWeight: '700' },
  rowValue: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  prompt: { marginHorizontal: spacing.lg, marginTop: spacing.lg, backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.lg, ...shadows.card },
  promptTitle: { ...typography.h3, color: colors.text },
  promptSub: { ...typography.caption, color: colors.textSecondary, marginTop: 5 },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  featureChip: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 9 },
  featureChipOn: { borderColor: colors.primary, backgroundColor: '#EAF0FF' },
  checkBox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  featureText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  featureTextOn: { color: colors.primary },
  submit: { marginHorizontal: spacing.lg, marginTop: spacing.xl, height: 50, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  submitText: { ...typography.bodyBold, color: colors.white },
});
