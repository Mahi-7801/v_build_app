import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, Image } from 'react-native';
import { Text } from '../components/LocalizedText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors } from '../theme/colors';
import { radius, spacing, typography, shadows } from '../theme/theme';
import { Icon, IconName } from '../components/Icon';
import { useAppStore } from '../store/useAppStore';
import { label, type LabelKey } from '../i18n/labels';
import { resetTo } from '../navigation/navigationRef';
import { ScreenEnter } from '../components/ScreenEnter';
import { EditProfileModal } from '../components/EditProfileModal';
import { GradientBox } from '../onboarding/design';
import { SelectModal, type SelectOption } from '../components/SelectModal';
import { ReminderModal } from '../components/ReminderModal';
import { SettingsExtras } from '../components/FitnessExtras';

const LANGUAGES = [
  { code: 'en', label: 'English' }, { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' }, { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' }, { code: 'pt', label: 'Português' },
  { code: 'ru', label: 'Русский' }, { code: 'ja', label: '日本語' },
  { code: 'zh_CN', label: '简体中文' }, { code: 'ko', label: '한국어' },
  { code: 'te', label: 'తెలుగు' },
];

export default function SettingsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, settings, lang, changeLanguage, updateSettings, signOut } = useAppStore();
  const toggle = (key: string, value: boolean) => updateSettings({ [key]: value });
  const L = (k: LabelKey) => label(lang, k);
  const [editOpen, setEditOpen] = useState(false);
  const [pref, setPref] = useState<'goal' | 'difficulty' | 'units' | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);

  const GOALS: SelectOption[] = [
    { label: 'Lose weight', value: 'lose_weight' },
    { label: 'Build muscle', value: 'build_muscle' },
    { label: 'Stay fit', value: 'stay_fit' },
  ];
  const LEVELS: SelectOption[] = [
    { label: 'Beginner', value: 1 },
    { label: 'Intermediate', value: 2 },
    { label: 'Advanced', value: 3 },
  ];
  const UNITS: SelectOption[] = [
    { label: 'Metric (kg / cm)', value: 'metric' },
    { label: 'Imperial (lbs / in)', value: 'imperial' },
  ];

  const goPro = () => nav.navigate('Pro');

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <ScreenEnter>

        <View style={styles.header}>
          <Text style={styles.kicker}>PERSONALIZE</Text>
          <Text style={styles.title}>{L('settings')}</Text>
        </View>

        {/* profile card */}
        <GradientBox radius={22} colors={[colors.gradientFrom, colors.gradientTo]} style={styles.profile}>
          <View style={styles.profileRow}>
            <TouchableOpacity activeOpacity={0.85} onPress={() => setEditOpen(true)} style={styles.avatarWrap}>
              {!!user?.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarInitial}>{(user?.display_name || 'G').charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.avatarBadge}><Icon name="settings" size={11} color={colors.primary} /></View>
            </TouchableOpacity>

            <View style={styles.profileInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>{user?.display_name || 'Guest'}</Text>
                {!!user?.is_pro && (
                  <View style={styles.proTag}><Icon name="crown" size={10} color="#7A4B00" /></View>
                )}
                {user?.email === 'demo@homeworkout.app' && (
                  <View style={styles.demoTag}><Text style={styles.demoTagText}>DEMO</Text></View>
                )}
              </View>
              <Text style={styles.email} numberOfLines={1}>
                {user?.email || 'Sign in to sync your progress'}
              </Text>
              {!!user?.phone && <Text style={styles.phone} numberOfLines={1}>{user.phone}</Text>}
            </View>
          </View>

          <View style={styles.profileActions}>
            <TouchableOpacity activeOpacity={0.85} onPress={() => setEditOpen(true)} style={styles.editBtn}>
              <Icon name="user" size={14} color={colors.primary} />
              <Text style={styles.editBtnText}>EDIT PROFILE</Text>
            </TouchableOpacity>
            {!!user?.is_pro ? (
              <View style={[styles.goProBtn, styles.goProBtnOn]}>
                <Icon name="check" size={14} color="#7A4B00" />
                <Text style={[styles.goProText, styles.goProTextOn]}>PRO ACTIVE</Text>
              </View>
            ) : (
              <TouchableOpacity activeOpacity={0.85} onPress={goPro} style={styles.goProBtn}>
                <Icon name="crown" size={14} color={colors.white} />
                <Text style={styles.goProText}>GO PRO</Text>
              </TouchableOpacity>
            )}
          </View>
        </GradientBox>

        {!user && (
          <TouchableOpacity style={styles.signinBtn} onPress={() => resetTo('Auth')}>
            <Text style={styles.signinText}>{L('signIn')}</Text>
          </TouchableOpacity>
        )}

        {/* PRO status */}
        <View style={styles.group}>
          <Text style={styles.groupTitle}>{user?.is_pro ? 'Membership' : 'Upgrade'}</Text>
          <View style={styles.proCard}>
            <View style={styles.proIcon}>
              <Icon name="crown" size={18} color={user?.is_pro ? colors.white : colors.pro} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.proTitle}>{user?.is_pro ? 'PRO plan is active' : 'Unlock every workout'}</Text>
              <Text style={styles.proSub}>
                {user?.is_pro
                  ? 'Enjoy all premium workouts and advanced analytics.'
                  : 'Ad-free, all plans, advanced analytics'}
              </Text>
            </View>
            {!!user?.is_pro ? (
              <Icon name="check" size={20} color={colors.primary} />
            ) : (
              <TouchableOpacity onPress={goPro} style={styles.proBtn}>
                <Text style={styles.proBtnText}>UPGRADE</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* account */}
        <Group title="Account">
          <Row icon="user" label="Name" value={user?.display_name || 'Guest'} onPress={() => setEditOpen(true)} />
          <Row icon="bell" label="Email" value={user?.email || 'Not signed in'} onPress={() => setEditOpen(true)} />
          <Row icon="info" label="Phone" value={user?.phone || 'Add number'} onPress={() => setEditOpen(true)} />
        </Group>

        <Group title={L('preferences')}>
          <Row icon="flame" label={L('goal')}
            value={GOALS.find((g) => g.value === (settings?.goal_type || 'stay_fit'))?.label || 'Stay fit'}
            onPress={() => setPref('goal')} />
          <Row icon="dumbbell" label={L('difficulty')}
            value={LEVELS.find((l) => l.value === Number(settings?.difficulty || 1))?.label || 'Beginner'}
            onPress={() => setPref('difficulty')} />
          <Row icon="scale" label={L('units')}
            value={settings?.units === 'imperial' ? 'Imperial' : 'Metric'}
            onPress={() => setPref('units')} />
        </Group>

        <Group title={L('language')}>
          <View style={styles.langGrid}>
            {LANGUAGES.map((l) => (
              <TouchableOpacity
                key={l.code}
                onPress={() => changeLanguage(l.code)}
                style={[styles.langChip, lang === l.code && styles.langChipActive]}
              >
                <Text style={[styles.langText, lang === l.code && styles.langTextActive]}>{l.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Group>

        <Group title={L('workout')}>
          <Toggle icon="play" label={L('autoStart')} value={!!settings?.auto_start_next} onValueChange={(v) => toggle('auto_start_next', v)} />
          <Toggle icon="bell" label={L('voiceCoaching')} value={!!settings?.voice_enabled} onValueChange={(v) => toggle('voice_enabled', v)} />
          <Toggle icon="star" label={L('keepScreenOn')} value={!!settings?.keep_screen_on} onValueChange={(v) => toggle('keep_screen_on', v)} />
          <Row icon={user?.is_pro ? 'bell' : 'lock'} label="Workout reminder"
            value={user?.is_pro ? 'Set time' : 'Locked · PRO'}
            onPress={() => user?.is_pro ? setReminderOpen(true) : nav.navigate('Pro')} />
        </Group>

        <SettingsExtras />

        {!!user && (
          <TouchableOpacity style={styles.logout} onPress={() => {
            Alert.alert('Sign out', 'Are you sure?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: async () => {
                await signOut();
                // Login becomes the new root — no blank Main tabs and no
                // forced trip through onboarding after signing out.
                resetTo('Auth');
              } },
            ]);
          }}>
            <Icon name="logout" size={17} color={colors.danger} />
            <Text style={styles.logoutText}>{L('signOut')}</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.version}>Your personal training companion</Text>
        </ScreenEnter>
      </ScrollView>
      <EditProfileModal visible={editOpen} onClose={() => setEditOpen(false)} />
      <ReminderModal visible={reminderOpen} onClose={() => setReminderOpen(false)} />
      <SelectModal
        visible={pref !== null}
        title={pref === 'goal' ? L('goal') : pref === 'difficulty' ? L('difficulty') : L('units')}
        options={pref === 'goal' ? GOALS : pref === 'difficulty' ? LEVELS : UNITS}
        selected={pref === 'goal'
          ? (settings?.goal_type || 'stay_fit')
          : pref === 'difficulty'
            ? Number(settings?.difficulty || 1)
            : (settings?.units || 'metric')}
        onSelect={(v) => updateSettings({ [pref || '']: v } as any)}
        onClose={() => setPref(null)}
      />
    </SafeAreaView>
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

function Row({ icon, label, value, onPress }: { icon: IconName; label: string; value: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.row}>
      <View style={styles.rowIcon}><Icon name={icon} size={17} color={colors.primary} /></View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
      </View>
      <Icon name="chevron" size={15} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function Toggle({ icon, label, value, onValueChange }: { icon: IconName; label: string; value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}><Icon name={icon} size={17} color={colors.primary} /></View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{value ? 'On' : 'Off'}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: colors.border, true: colors.primary }} thumbColor={colors.white} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingBottom: 40 },

  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
  kicker: { ...typography.tiny, color: colors.primary, fontWeight: '900', letterSpacing: 1.4 },
  title: { ...typography.h1, color: colors.text, marginTop: 4 },

  profile: {
    marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.lg,
    shadowColor: colors.primary, shadowOpacity: 0.28, shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
  },
  avatarImg: {
    width: 64, height: 64, borderRadius: 32,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
  },
  avatarInitial: { color: colors.white, fontSize: 26, fontWeight: '900' },
  avatarBadge: {
    position: 'absolute', right: -3, bottom: -3,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.gradientTo,
  },
  profileInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: { color: colors.white, fontSize: 19, fontWeight: '900', flexShrink: 1 },
  proTag: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.pro, alignItems: 'center', justifyContent: 'center',
  },
  demoTag: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  demoTagText: { fontSize: 9, fontWeight: '900', color: colors.primaryDark, letterSpacing: 0.5 },
  email: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600', marginTop: 5 },
  phone: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 3 },

  profileActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  editBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    height: 44, borderRadius: radius.pill, backgroundColor: colors.white,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  editBtnText: { fontSize: 12, fontWeight: '900', color: colors.primary, letterSpacing: 0.6 },
  goProBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    height: 44, borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)',
  },
  goProText: { fontSize: 12, fontWeight: '900', color: colors.white, letterSpacing: 0.6 },
  goProBtnOn: {
    backgroundColor: colors.pro, borderColor: colors.pro,
    shadowColor: colors.pro, shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  goProTextOn: { color: '#7A4B00' },

  signinBtn: {
    marginHorizontal: spacing.lg, marginTop: spacing.md, height: 48,
    borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  signinText: { ...typography.bodyBold, color: colors.primary },

  group: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
  groupTitle: {
    ...typography.caption, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm, marginLeft: 4,
  },
  card: { backgroundColor: colors.white, borderRadius: radius.xl, ...shadows.card, overflow: 'hidden' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: 14,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  rowIcon: {
    width: 34, height: 34, borderRadius: 11,
    backgroundColor: '#EDF3FF', alignItems: 'center', justifyContent: 'center',
  },
  rowCopy: { flex: 1 },
  rowLabel: { ...typography.body, color: colors.text, fontWeight: '700' },
  rowValue: { ...typography.caption, color: colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
  rowHint: { ...typography.caption, color: colors.textMuted, marginTop: 2 },

  proCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.xl, padding: 14, ...shadows.card,
  },
  proIcon: {
    width: 40, height: 40, borderRadius: 13,
    backgroundColor: '#FFF4DC', alignItems: 'center', justifyContent: 'center',
  },
  proTitle: { ...typography.bodyBold, color: colors.text },
  proSub: { ...typography.caption, color: colors.textSecondary, marginTop: 3 },
  proBtn: {
    paddingHorizontal: 14, height: 34, borderRadius: radius.pill,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  proBtnText: { fontSize: 11, fontWeight: '900', color: colors.white, letterSpacing: 0.6 },

  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.md },
  langChip: {
    paddingHorizontal: spacing.md, paddingVertical: 9,
    borderRadius: radius.pill, backgroundColor: colors.canvas,
    borderWidth: 1, borderColor: colors.border,
  },
  langChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  langTextActive: { color: colors.white },

  logout: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    marginHorizontal: spacing.lg, marginTop: spacing.xl,
    height: 50, borderRadius: radius.lg, backgroundColor: '#FFF0F0',
    borderWidth: 1, borderColor: '#FFDCDC',
  },
  logoutText: { ...typography.bodyBold, color: colors.danger },
  version: { ...typography.tiny, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
});
