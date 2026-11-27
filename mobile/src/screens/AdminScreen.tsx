import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity, Pressable, TextInput,
  Modal, ActivityIndicator, RefreshControl, Platform, Alert, Image, AppState, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors } from '../theme/colors';
import { radius, spacing, typography, shadows } from '../theme/theme';
import { Icon } from '../components/Icon';
import { adminApi, resolveAssetUrl } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { resetTo } from '../navigation/navigationRef';
import { compactMoney, formatMoney, formatPoints } from '../points';
import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { GradientBox } from '../onboarding/design';
import { ExerciseArt } from '../components/ExerciseArt';
import { COVERS } from '../onboarding/coverImages';
import { CHARACTER_GIFS } from '../data/characterGifs';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';

type Tab = 'overview' | 'users' | 'plans' | 'payments' | 'upload' | 'settings';
// Same navigation shape as the user app, but admin content behind each button.
const TABS: Array<{ key: Tab; label: string; icon: any }> = [
  { key: 'overview', label: 'Home', icon: 'home' },
  { key: 'plans', label: 'Workouts', icon: 'dumbbell' },
  { key: 'users', label: 'Users', icon: 'award' },
  { key: 'payments', label: 'Payments', icon: 'crown' },
  { key: 'upload', label: 'Upload', icon: 'plus' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];
const CATEGORIES = ['abs', 'chest', 'arms', 'legs', 'shoulder', 'hiit', 'stretch', 'full_body', 'back', 'core', 'other'];
const AVATAR_TINTS = ['#EAF0FF', '#E7F8EF', '#FFF0D6', '#F3E8FF', '#FFE9E9', '#E6F6F7'];
const AVATAR_TONES = [colors.primary, colors.success, '#B48600', colors.accentPurple, colors.danger, colors.accentTeal];
const BUNDLED_ANIMATION_IDS = Object.keys(CHARACTER_GIFS).map(Number).sort((a, b) => a - b);

type Period = 'today' | 'week' | 'month' | 'all';
const PERIODS: Array<{ key: Period; tab: string; label: string }> = [
  { key: 'today', tab: 'TODAY', label: 'Today' },
  { key: 'week', tab: '7 DAYS', label: 'Last 7 days' },
  { key: 'month', tab: '30 DAYS', label: 'Last 30 days' },
  { key: 'all', tab: 'ALL TIME', label: 'All time' },
];

/** Human, time-based label for the live activity feed. */
function timeAgo(iso?: string, now = new Date()) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const mins = Math.max(0, Math.floor((now.getTime() - t) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function dayLabel(day: string) {
  const d = new Date(`${day}T00:00:00`);
  return isNaN(d.getTime()) ? day : d.toLocaleDateString(undefined, { weekday: 'narrow' });
}

/** Device-local time including seconds, so the admin can see it ticking. */
function clockText(d: Date) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).format(d);
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
}

function paymentGroup(status?: string): 'success' | 'pending' | 'failed' {
  const s = String(status || '').toLowerCase();
  if (['captured', 'success', 'paid'].includes(s)) return 'success';
  if (['created', 'authorized', 'pending'].includes(s)) return 'pending';
  return 'failed';
}

/** Random, unique plan code — prevents duplicate codes without admin typing. */
function randomPlanCode() {
  return `wm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function statusStyle(status?: string) {
  const s = String(status || '').toLowerCase();
  if (['captured', 'success', 'paid'].includes(s)) {
    return { bg: '#E7F8EF', fg: '#117A45', label: 'SUCCESS' };
  }
  if (s === 'created' || s === 'authorized' || s === 'pending') {
    return { bg: '#FFF7DF', fg: '#B48600', label: 'PENDING' };
  }
  return { bg: '#FFE9E9', fg: colors.danger, label: 'FAILED' };
}

function PaymentKV({ label, value }: { label: string; value: any }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue} numberOfLines={2}>{value === null || value === undefined || value === '' ? '—' : String(value)}</Text>
    </View>
  );
}

function TotalTile({ icon, value, label, tint, color }: {
  icon: any; value: string | number; label: string; tint: string; color: string;
}) {
  return (
    <View style={styles.totalTile}>
      <View style={[styles.totalTileIcon, { backgroundColor: tint }]}>
        <Icon name={icon} size={16} color={color} />
      </View>
      <Text style={styles.totalTileValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.totalTileLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function DetailSection({ icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.detailSection}>
      <View style={styles.detailSectionHead}>
        <View style={styles.detailSectionIcon}><Icon name={icon} size={15} color={colors.primary} /></View>
        <Text style={styles.detailSectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function DetailRow({ icon, title, sub, right }: { icon: any; title: string; sub: string; right: string }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailRowIcon}><Icon name={icon} size={14} color={colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.detailRowTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.detailRowSub} numberOfLines={1}>{sub}</Text>
      </View>
      <Text style={styles.detailRowRight}>{right}</Text>
    </View>
  );
}

function DetailStat({ icon, value, label }: { icon: any; value: string | number; label: string }) {
  return (
    <View style={styles.detailStat}>
      <Icon name={icon} size={14} color={colors.primary} />
      <Text style={styles.detailStatValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.detailStatLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export default function AdminScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const signOut = useAppStore((s) => s.signOut);
  const refreshConfig = useAppStore((s) => s.refreshConfig);
  const pointsTarget = useAppStore((s) => s.pointsTarget);
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState<Period>('week');
  const [now, setNow] = useState(() => new Date());
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [overview, setOverview] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [userFilter, setUserFilter] = useState<'all' | 'pro' | 'free' | 'new'>('all');
  const [userSort, setUserSort] = useState<'newest' | 'points' | 'workouts'>('newest');
  const [userStats, setUserStats] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [exercises, setExercises] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [exerciseQuery, setExerciseQuery] = useState('');
  const [showAllEx, setShowAllEx] = useState(false);
  const [planQuery, setPlanQuery] = useState('');
  const [planLevel, setPlanLevel] = useState<'all' | '1' | '2' | '3'>('all');
  const [detail, setDetail] = useState<any>(null);
  const [userOpen, setUserOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [usersError, setUsersError] = useState('');
  const [editPlan, setEditPlan] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [form, setForm] = useState({
    name: '', code: randomPlanCode(), category: 'abs', level: 1, durationSec: 10,
    priceCents: 0, lottieUrl: '', coverImage: '', description: '', exerciseIds: [] as number[],
  });
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [dayName, setDayName] = useState('Day 1');
  const [itemSettings, setItemSettings] = useState<Record<number, { timeSec: number; restSec: number; rounds: number }>>({});
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryItems, setLibraryItems] = useState<any[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryPlans, setLibraryPlans] = useState<any[]>([]);
  const [selectedLibraryPlan, setSelectedLibraryPlan] = useState<number | null>(null);
  const [libraryGroupItems, setLibraryGroupItems] = useState<any[]>([]);
  const [editingExerciseId, setEditingExerciseId] = useState<number | null>(null);
  const [exerciseEditorOpen, setExerciseEditorOpen] = useState(false);
  const [animationPickerOpen, setAnimationPickerOpen] = useState(false);
  const [animationTarget, setAnimationTarget] = useState<{ id: number; name: string } | null>(null);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const [exerciseForm, setExerciseForm] = useState({
    name: '', actionId: '', slug: '', level: '1', primaryMuscle: '', equipment: 'none',
    unit: 's', lottieUrl: '', audioUrl: '', videoUrl: '', description: '', steps: '', coachTips: '',
  });
  const [settingsForm, setSettingsForm] = useState({
    pointsTarget: '5000', discountPercent: '40', proPriceCents: '2999',
    paymentCurrency: 'INR', supportEmail: '', supportAddress: '', supportPhone: '',
    razorpayKeyId: '', razorpayKeySecret: '', latestAppVersion: '', appUpdateUrl: '',
  });
  // Only non-secret flags come back from the server — secret values never do.
  const [paymentFlags, setPaymentFlags] = useState({
    keyIdConfigured: false, secretConfigured: false, demoMode: false, keyIdPreview: '',
  });
  const [accountForm, setAccountForm] = useState({
    email: '', displayName: '', currentPassword: '', newPassword: '',
  });
  const [payments, setPayments] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [paymentsError, setPaymentsError] = useState('');
  const [paymentStats, setPaymentStats] = useState<any>({ total: 0, successful: 0, revenue: 0, todayCount: 0, todayRevenue: 0, currency: 'INR' });
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'success' | 'pending' | 'failed'>('all');
  const [paymentSort, setPaymentSort] = useState<'newest' | 'amount'>('newest');
  const [paymentQuery, setPaymentQuery] = useState('');
  const [detailPayment, setDetailPayment] = useState<any>(null);
  const [manualPayOpen, setManualPayOpen] = useState(false);
  const [manualPayForm, setManualPayForm] = useState({
    email: '', amount: '29.99', method: 'upi', paymentId: '', grantPro: true,
  });
  const [toast, setToast] = useState<{ tone: 'ok' | 'err'; title: string; message: string } | null>(null);
  const [audioGapReport, setAudioGapReport] = useState<any>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const previewPlayerRef = React.useRef<AudioPlayer | null>(null);

  useEffect(() => () => { try { previewPlayerRef.current?.remove?.(); } catch { /* ignore */ } }, []);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      if (tab === 'overview') {
        const r = await adminApi.overview();
        setOverview(r.data);
        setSyncedAt(new Date());
      } else if (tab === 'users') {
        setUsersError('');
        const [usersRes, statsRes] = await Promise.allSettled([
          adminApi.users(query),
          adminApi.overview(),
        ]);
        if (usersRes.status === 'fulfilled') {
          setUsers(usersRes.value.data?.users || []);
        } else {
          const err: any = usersRes.reason;
          setUsersError(err?.response?.data?.message || err?.message || 'Could not load users.');
        }
        if (statsRes.status === 'fulfilled') {
          setUserStats(statsRes.value.data);
        }
      } else if (tab === 'plans') {
        const [r, gaps] = await Promise.all([
          adminApi.plans(),
          adminApi.audioGaps().catch(() => ({ data: null })),
        ]);
        setPlans(r.data.plans || []);
        if (gaps?.data) setAudioGapReport(gaps.data);
      } else if (tab === 'payments') {
        setPaymentsError('');
        try {
          const r = await adminApi.payments(paymentQuery);
          setPayments(r.data?.payments || []);
          setSubscriptions(r.data?.subscriptions || []);
          setPaymentStats(r.data?.stats || { total: 0, successful: 0, revenue: 0, currency: 'INR' });
          if (r.data?.gateway) {
            setPaymentFlags({
              keyIdConfigured: !!r.data.gateway.keyIdConfigured,
              secretConfigured: !!r.data.gateway.secretConfigured,
              demoMode: !!r.data.gateway.demoMode,
              keyIdPreview: String(r.data.gateway.keyIdPreview || ''),
            });
          }
        } catch (err: any) {
          setPaymentsError(err?.response?.data?.message || err?.message || 'Could not load payments.');
        }
      } else if (tab === 'upload') {
        // Show exercises matching the workout level + search typed by admin.
        const r = await adminApi.exercises(form.level, exerciseQuery);
        setExercises(r.data.exercises || []);
      } else {
        const [r, acct] = await Promise.all([adminApi.settings(), adminApi.account()]);
        setAccountForm({
          email: String(acct.data?.email || ''),
          displayName: String(acct.data?.displayName || 'Admin'),
          currentPassword: '', newPassword: '',
        });
        const s = r.data.settings || {};
        setSettingsForm({
          pointsTarget: String(s.pointsTarget ?? 5000),
          discountPercent: String(s.discountPercent ?? 40),
          proPriceCents: String(s.proPriceCents ?? 2999),
          paymentCurrency: String(s.paymentCurrency || 'INR'),
          supportEmail: String(s.supportEmail || ''),
          supportAddress: String(s.supportAddress || ''),
          supportPhone: String(s.supportPhone || ''),
          // Never prefill secrets — they are not readable from the server.
          razorpayKeyId: '',
          razorpayKeySecret: '',
          latestAppVersion: String(s.latestAppVersion || ''),
          appUpdateUrl: String(s.appUpdateUrl || ''),
        });
        setPaymentFlags({
          keyIdConfigured: !!r.data.payment?.keyIdConfigured,
          secretConfigured: !!r.data.payment?.secretConfigured,
          demoMode: !!r.data.payment?.demoMode,
          keyIdPreview: String(r.data.payment?.keyIdPreview || ''),
        });
      }
    } catch { /* keep previous state */ }
    finally { setBusy(false); }
  }, [tab, query, form.level, exerciseQuery, paymentQuery]);

  useEffect(() => { load(); }, [load]);

  // Original simple library: fetch all exercises once (client caches for 60s).
  const loadLibrary = useCallback(async () => {
    if (!libraryOpen) return;
    setLibraryLoading(true);
    try {
      const r = await adminApi.exercises(0, libraryQuery);
      setLibraryItems(r.data.exercises || []);
    } catch { /* keep previous list */ }
    finally { setLibraryLoading(false); }
  }, [libraryOpen, libraryQuery]);

  // Debounce search and avoid a refetch on every reopen (client GET cache is 60s).
  useEffect(() => {
    if (!libraryOpen) return;
    const timer = setTimeout(() => { loadLibrary(); }, 200);
    return () => clearTimeout(timer);
  }, [libraryOpen, libraryQuery, loadLibrary]);

  // Tick every second and resync immediately when the app returns from the
  // background — background JS timers are paused by the OS, which made the
  // admin header clock appear stuck or show an old time.
  useEffect(() => {
    let active = true;
    const tick = () => { if (active) setNow(new Date()); };
    tick();
    const timer = setInterval(tick, 1000);
    const onForeground = (state: string) => {
      if (state !== 'active') return;
      tick();
      if (tab === 'overview') load();
    };
    const subscription = AppState.addEventListener('change', onForeground);
    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [tab, load]);

  // Keep the home-page activity feed live while the admin is on the overview tab.
  useEffect(() => {
    if (tab !== 'overview') return;
    const timer = setInterval(() => { load(); }, 30_000);
    return () => clearInterval(timer);
  }, [tab, load]);

  /** Open the modal instantly from list data, then fill in the full history. */
  const openUser = async (row: any) => {
    const id = Number(typeof row === 'object' ? row?.id : row);
    if (!id) return;
    const listed = users.find((u) => Number(u.id) === id) || row;
    setDetailError('');
    setDetail({
      user: {
        id,
        display_name: listed?.display_name || listed?.name,
        email: listed?.email,
        is_pro: !!(listed?.is_pro ?? listed?.isPro),
        points: Number(listed?.points || 0),
        created_at: listed?.created_at,
      },
      progress: {
        sessions: Number(listed?.sessions || 0),
        minutes: Math.round(Number(listed?.seconds || 0) / 60),
        calories: Math.round(Number(listed?.calories || 0)),
        exercises: Number(listed?.exercises || 0),
      },
      workouts: [], plans: [], achievements: [], pointsLedger: [],
    });
    setUserOpen(true);
    setDetailLoading(true);
    try {
      const r = await adminApi.user(id);
      if (r.data?.user) {
        setDetail(r.data);
      } else {
        setDetailError('User profile data was empty.');
      }
    } catch (err: any) {
      setDetailError(err?.response?.data?.message || err?.message || 'Could not load user activity.');
    } finally {
      setDetailLoading(false);
    }
  };

  const savePlan = async () => {
    if (!editPlan) return;
    setBusy(true);
    try {
      await adminApi.updatePlan(editPlan.id, {
        name: editName.trim() || editPlan.name,
        price_cents: Math.max(0, Number(editPrice) || 0),
      });
      const r = await adminApi.plans();
      setPlans(r.data.plans || []);
      setEditPlan(null);
      notify('Workout updated', 'Price and details saved successfully.', 'Workout updated successfully');
    } catch (err: any) {
      Alert.alert('Save failed', err?.response?.data?.message || err?.message || 'Could not save workout. Check the server and try again.');
    } finally { setBusy(false); }
  };

  const workoutItems = () => form.exerciseIds.map((id) => ({
    exerciseId: id,
    timeSec: itemSettings[id]?.timeSec ?? 30,
    restSec: itemSettings[id]?.restSec ?? 10,
    rounds: itemSettings[id]?.rounds ?? 1,
  }));

  const resetBuilder = () => {
    setForm({ name: '', code: randomPlanCode(), category: 'abs', level: 1, durationSec: 10, priceCents: 0, lottieUrl: '', coverImage: '', description: '', exerciseIds: [] });
    setEditingPlanId(null);
    setDayName('Day 1');
    setItemSettings({});
  };

  /** Load an existing workout into the builder for editing. */
  const editPlanInBuilder = async (id: number) => {
    setBusy(true);
    try {
      const r = await adminApi.planDetail(id);
      const plan = r.data.plan || {};
      const items = r.data.items || [];
      setForm({
        name: plan.name || '', code: plan.code || '', category: plan.category || 'abs',
        level: Number(plan.level || 1), durationSec: Math.round((plan.duration_sec || 0) / 60),
        priceCents: Number(plan.price_cents || 0), lottieUrl: plan.lottie_url || '',
        coverImage: plan.cover_image || '', description: plan.description || '',
        exerciseIds: items.map((it: any) => Number(it.exercise_id || 0)).filter(Boolean),
      });
      const settings: Record<number, { timeSec: number; restSec: number; rounds: number }> = {};
      for (const it of items) {
        if (it.exercise_id) settings[it.exercise_id] = {
          timeSec: Number(it.time_sec || 30), restSec: Number(it.rest_sec || 10), rounds: Number(it.rounds || 1),
        };
      }
      setItemSettings(settings);
      setDayName(r.data.days?.[0]?.name || 'Day 1');
      setEditingPlanId(Number(id));
      setTab('upload');
    } catch { /* keep current builder */ }
    finally { setBusy(false); }
  };

  const saveWorkout = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      if (editingPlanId) {
        await adminApi.updatePlan(editingPlanId, {
          name: form.name.trim(), description: form.description,
          category: form.category, level: form.level,
          duration_sec: form.durationSec * 60, price_cents: form.priceCents,
          lottie_url: form.lottieUrl.trim() || null,
          cover_image: form.coverImage.trim() || null,
          dayName, items: workoutItems(),
        });
      } else {
        await adminApi.createPlan({
          name: form.name.trim(), code: form.code.trim() || randomPlanCode(),
          category: form.category, level: form.level,
          durationSec: form.durationSec, priceCents: form.priceCents,
          lottieUrl: form.lottieUrl.trim() || undefined,
          coverImage: form.coverImage.trim() || undefined,
          description: form.description, dayName, items: workoutItems(),
        });
      }
      resetBuilder();
      const r = await adminApi.plans();
      setPlans(r.data.plans || []);
      setTab('plans');
      notify(editingPlanId ? 'Workout updated' : 'Workout added',
        'Exercises, timings, animations and details are live for all users.',
        'Workout saved successfully');
    } catch (err: any) {
      Alert.alert('Save failed', err?.response?.data?.message || err?.message || 'Could not save workout. Check the server and try again.');
    } finally { setBusy(false); }
  };

  /** Open the exercise editor; fetches full detail when editing an existing one. */
  const openExerciseEditor = async (id?: number) => {
    setExerciseEditorOpen(true);
    if (!id) {
      setEditingExerciseId(null);
      setExerciseForm({
        name: '', actionId: '', slug: '', level: '1', primaryMuscle: '', equipment: 'none',
        unit: 's', lottieUrl: '', audioUrl: '', videoUrl: '', description: '', steps: '', coachTips: '',
      });
      return;
    }
    setBusy(true);
    try {
      const r = await adminApi.exerciseDetail(id);
      const e = r.data.exercise || {};
      setEditingExerciseId(id);
      setExerciseForm({
        name: e.name || '', actionId: String(e.action_id || ''), slug: e.slug || '',
        level: String(e.level || 1), primaryMuscle: e.primary_muscle || '',
        equipment: e.equipment || 'none', unit: e.unit || 's',
        lottieUrl: e.lottie_path || '', audioUrl: e.audio_url || '', videoUrl: e.video_url || '',
        description: r.data.text?.description || e.introduce || '',
        steps: (r.data.steps || []).map((s: any) => s.text || s).join('\n'),
        coachTips: (r.data.coachTips || []).join('\n'),
      });
    } catch (err: any) {
      Alert.alert('Save failed', err?.response?.data?.message || err?.message || 'Could not save workout. Check the server and try again.');
    } finally { setBusy(false); }
  };

  const saveExercise = async () => {
    if (!exerciseForm.name.trim()) return;
    setBusy(true);
    try {
      const payload = {
        name: exerciseForm.name.trim(), actionId: Number(exerciseForm.actionId) || undefined,
        slug: exerciseForm.slug.trim() || undefined, level: Number(exerciseForm.level) || 1,
        primaryMuscle: exerciseForm.primaryMuscle.trim(), equipment: exerciseForm.equipment,
        unit: exerciseForm.unit, lottieUrl: exerciseForm.lottieUrl.trim(),
        audioUrl: exerciseForm.audioUrl.trim(),
        videoUrl: exerciseForm.videoUrl.trim(), description: exerciseForm.description.trim(),
        steps: exerciseForm.steps.split('\n').map((s) => s.trim()).filter(Boolean),
        coachTips: exerciseForm.coachTips.split('\n').map((s) => s.trim()).filter(Boolean),
      };
      if (editingExerciseId) await adminApi.updateExercise(editingExerciseId, payload);
      else await adminApi.createExercise(payload);
      const r = await adminApi.exercises(form.level, exerciseQuery);
      setExercises(r.data.exercises || []);
      setEditingExerciseId(null);
      setExerciseEditorOpen(false);
      notify('Exercise saved', 'Animation, description, steps and coach tips are live for all users.', 'Exercise saved successfully');
    } catch (err: any) {
      Alert.alert('Save failed', err?.response?.data?.message || err?.message || 'Could not save workout. Check the server and try again.');
    } finally { setBusy(false); }
  };

  /** Add/remove exercises from the builder with a single source of truth. */
  const addExercise = (id: number) => {
    const value = Number(id);
    setForm((f) => (
      f.exerciseIds.some((x) => Number(x) === value)
        ? f : { ...f, exerciseIds: [...f.exerciseIds, value] }
    ));
  };
  const removeExercise = (id: number) => {
    const value = Number(id);
    setForm((f) => ({ ...f, exerciseIds: f.exerciseIds.filter((x) => Number(x) !== value) }));
    setItemSettings((s) => {
      const next = { ...s };
      delete next[value];
      return next;
    });
  };

  /** Reuse one of the 352 bundled character animations (same look as the app). */
  const chooseBundledAnimation = async (id: number) => {
    if (animationTarget) {
      setBusy(true);
      try {
        await adminApi.updateExercise(animationTarget.id, { actionId: id, lottieUrl: '' });
        const r = await adminApi.exercises(0, libraryQuery);
        setLibraryItems(r.data.exercises || []);
        const b = await adminApi.exercises(form.level, exerciseQuery);
        setExercises(b.data.exercises || []);
        notify('Animation added', `${animationTarget.name} now uses app animation ${id}.`, 'Animation added');
      } catch { /* ignore */ }
      finally { setBusy(false); }
      setAnimationTarget(null);
      setAnimationPickerOpen(false);
      return;
    }
    setExerciseForm((f) => ({ ...f, actionId: String(id), lottieUrl: '' }));
    setAnimationPickerOpen(false);
  };

  /** Open the bundled-animation picker for an exercise that has no animation. */
  const addAnimationTo = (e: any) => {
    setAnimationTarget({ id: Number(e.id), name: e.name });
    setAnimationPickerOpen(true);
  };

  /** Pick an animation file (Lottie JSON / GIF / image) and store it on the server. */
  const uploadAnimationFile = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'image/gif', 'image/png', 'image/jpeg'],
        copyToCacheDirectory: true, multiple: false,
      });
      if (picked.canceled) return;
      const asset: any = picked.assets?.[0] || picked;
      const uri = String(asset.uri || '');
      const ext = (String(asset.name || uri).split('.').pop() || 'json').split('?')[0].toLowerCase();
      const mimeType = asset.mimeType
        || (ext === 'json' ? 'application/json' : ext === 'gif' ? 'image/gif' : ext === 'png' ? 'image/png' : 'image/jpeg');
      setBusy(true);
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const r = await adminApi.uploadAnimation({ name: `anim_${Date.now()}`, mimeType, base64 });
      setExerciseForm((f) => ({ ...f, lottieUrl: r.data.url }));
      notify('Animation uploaded', 'This animation is now attached to the exercise.', 'Animation uploaded');
    } catch {
      Alert.alert('Upload failed', 'Could not read or upload that file. Try a Lottie JSON, GIF, PNG or JPG under 5 MB.');
    } finally { setBusy(false); }
  };

  /** Pick a cover image for the workout and store it on the server. */
  const uploadCoverImage = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
        copyToCacheDirectory: true, multiple: false,
      });
      if (picked.canceled) return;
      const asset: any = picked.assets?.[0] || picked;
      const uri = String(asset.uri || '');
      const ext = (String(asset.name || uri).split('.').pop() || 'png').split('?')[0].toLowerCase();
      const mimeType = asset.mimeType || (ext === 'gif' ? 'image/gif' : ext === 'png' ? 'image/png' : 'image/jpeg');
      setBusy(true);
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const r = await adminApi.uploadAnimation({ name: `cover_${Date.now()}`, mimeType, base64 });
      setForm((f) => ({ ...f, coverImage: r.data.url }));
      notify('Cover uploaded', 'Your cover image is now shown above the workout.', 'Cover uploaded');
    } catch {
      Alert.alert('Upload failed', 'Could not upload that image. Try a PNG, JPG or GIF under 5 MB.');
    } finally { setBusy(false); }
  };

  /** Clone an exercise so the admin can rename it and change animation/sound/details. */
  const duplicateExercise = async (id: number) => {
    setBusy(true);
    try {
      const r = await adminApi.duplicateExercise(id);
      const list = await adminApi.exercises(form.level, exerciseQuery);
      setExercises(list.data.exercises || []);
      await openExerciseEditor(Number(r.data.exercise.id));
    } catch (err: any) {
      Alert.alert('Save failed', err?.response?.data?.message || err?.message || 'Could not save workout. Check the server and try again.');
    } finally { setBusy(false); }
  };

  /** Pick an audio file and store it on the server as this exercise's sound cue. */
  const uploadSoundFile = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled) return;
      const asset: any = picked.assets?.[0] || picked;
      const uri = String(asset.uri || '');
      const ext = (String(asset.name || uri).split('.').pop() || 'mp3').split('?')[0].toLowerCase();
      const mimeTypes: Record<string, string> = {
        mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', wav: 'audio/wav',
        ogg: 'audio/ogg', aac: 'audio/aac', webm: 'audio/webm',
      };
      const mimeType = asset.mimeType || mimeTypes[ext] || 'audio/mpeg';
      setBusy(true);
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const r = await adminApi.uploadAudio({ name: `sound_${Date.now()}`, mimeType, base64 });
      setExerciseForm((f) => ({ ...f, audioUrl: r.data.url }));
      notify('Sound uploaded', 'This sound will play when the exercise starts in a workout.', 'Sound uploaded');
    } catch {
      Alert.alert('Upload failed', 'Could not read or upload that audio file. Try MP3, M4A, WAV or OGG under 8 MB.');
    } finally { setBusy(false); }
  };

  /** Preview an exercise's coaching sound cue directly in the admin panel. */
  const previewSoundUrl = async (url?: string | null) => {
    const resolved = resolveAssetUrl(url);
    if (!resolved) {
      Alert.alert('No audio yet', 'Generate or upload an audio cue first.');
      return;
    }
    try {
      await setAudioModeAsync({ playsInSilentMode: true }).catch(() => { });
      previewPlayerRef.current?.remove?.();
      const player = createAudioPlayer(resolved);
      previewPlayerRef.current = player;
      player.play();
    } catch (err: any) {
      Alert.alert('Playback error', err?.message || 'Could not play audio preview.');
    }
  };

  /** Scan all workout plans for audio gaps, then generate and apply missing coaching audio. */
  const checkAndGenerateWorkoutAudio = async (onlyScan = false, planId?: number) => {
    setAudioBusy(true);
    try {
      const gapRes = await adminApi.audioGaps();
      setAudioGapReport(gapRes.data);
      const missingCount = Number(gapRes.data?.summary?.exercisesMissingAudio || 0);
      if (onlyScan) {
        const s = gapRes.data?.summary || {};
        notify(
          'Audio gap check complete',
          `${s.readyPlans ?? 0}/${s.totalPlans ?? 0} workouts ready · ${s.exercisesWithAudio ?? 0}/${s.totalExercises ?? 0} exercises have audio.`,
          missingCount ? `${missingCount} exercises need audio` : 'All workouts have audio'
        );
        return;
      }
      const genRes = await adminApi.generateAudio(planId ? { planId } : {});
      const [plansRes, exRes, freshGap] = await Promise.all([
        adminApi.plans(),
        adminApi.exercises(form.level, exerciseQuery),
        adminApi.audioGaps().catch(() => null),
      ]);
      setPlans(plansRes.data.plans || []);
      setExercises(exRes.data.exercises || []);
      if (freshGap?.data) setAudioGapReport(freshGap.data);
      const generatedCount = Number(genRes.data?.generatedCount || 0);
      notify(
        generatedCount ? 'Workout audio applied' : 'All workouts ready',
        generatedCount
          ? `Generated and applied coaching audio for ${generatedCount} missing exercise${generatedCount === 1 ? '' : 's'}.`
          : 'Every workout and exercise already has coaching audio.',
        generatedCount ? `Generated ${generatedCount} audio cues` : 'All workout audio ready'
      );
    } catch (err: any) {
      Alert.alert('Audio generation failed', err?.response?.data?.message || err?.message || 'Could not check or generate workout audio.');
    } finally { setAudioBusy(false); }
  };

  /** Generate/regenerate coaching audio for the exercise currently open in the editor. */
  const generateSingleExerciseAudio = async () => {
    if (!exerciseForm.name.trim()) {
      Alert.alert('Name required', 'Enter an exercise name first.');
      return;
    }
    if (!editingExerciseId) {
      Alert.alert('Save exercise first', 'Tap SAVE EXERCISE — coaching audio is generated automatically on save, or you can regenerate right after.');
      return;
    }
    setAudioBusy(true);
    try {
      const r = await adminApi.generateExerciseAudio(editingExerciseId);
      const url = r.data?.exercise?.audio_url || r.data?.generated?.audioUrl || '';
      if (url) setExerciseForm((f) => ({ ...f, audioUrl: url }));
      const [exRes, gapRes] = await Promise.all([
        adminApi.exercises(form.level, exerciseQuery),
        adminApi.audioGaps().catch(() => null),
      ]);
      setExercises(exRes.data.exercises || []);
      if (gapRes?.data) setAudioGapReport(gapRes.data);
      notify('Audio generated', 'Coaching voice cue generated and applied to this exercise.', 'Exercise audio generated');
    } catch (err: any) {
      Alert.alert('Generation failed', err?.response?.data?.message || err?.message || 'Could not generate exercise audio.');
    } finally { setAudioBusy(false); }
  };

  const saveSettings = async () => {
    setBusy(true);
    try {
      const payload: any = {
        pointsTarget: Math.max(1, Number(settingsForm.pointsTarget) || 5000),
        discountPercent: Math.min(100, Math.max(0, Number(settingsForm.discountPercent) || 0)),
        proPriceCents: Math.max(0, Number(settingsForm.proPriceCents) || 0),
        paymentCurrency: settingsForm.paymentCurrency.trim().toUpperCase() || 'INR',
        supportEmail: settingsForm.supportEmail.trim(),
        supportAddress: settingsForm.supportAddress.trim(),
        supportPhone: settingsForm.supportPhone.trim(),
        latestAppVersion: settingsForm.latestAppVersion.trim(),
        appUpdateUrl: settingsForm.appUpdateUrl.trim(),
      };
      // Blank inputs mean "keep the existing key" — keys are write-only.
      if (settingsForm.razorpayKeyId.trim()) payload.razorpayKeyId = settingsForm.razorpayKeyId.trim();
      if (settingsForm.razorpayKeySecret.trim()) payload.razorpayKeySecret = settingsForm.razorpayKeySecret.trim();
      const r = await adminApi.updateSettings(payload);
      setPaymentFlags({
        keyIdConfigured: !!r.data.payment?.keyIdConfigured,
        secretConfigured: !!r.data.payment?.secretConfigured,
        demoMode: !!r.data.payment?.demoMode,
        keyIdPreview: String(r.data.payment?.keyIdPreview || ''),
      });
      setSettingsForm((f) => ({ ...f, razorpayKeyId: '', razorpayKeySecret: '' }));
      await refreshConfig();
      notify('Settings saved', 'Rewards, support details and payment gateway updated.', 'Settings saved successfully');
    } catch (err: any) {
      showError('Save failed', err?.response?.data?.message || err?.message || 'Could not save settings. Check the server and try again.');
    } finally { setBusy(false); }
  };

  const openManualPayment = async () => {
    const defaultAmt = (Number(settingsForm.proPriceCents || 2999) / 100).toFixed(2);
    setManualPayForm((f) => ({
      email: f.email || users[0]?.email || '',
      amount: defaultAmt,
      method: 'upi',
      paymentId: '',
      grantPro: true,
    }));
    setManualPayOpen(true);
    if (!users.length) {
      try {
        const r = await adminApi.users('');
        const list = r.data?.users || [];
        setUsers(list);
        if (list[0]?.email) {
          setManualPayForm((f) => (f.email ? f : { ...f, email: list[0].email }));
        }
      } catch { /* user can still type email */ }
    }
  };

  const saveManualPayment = async () => {
    const email = manualPayForm.email.trim();
    if (!email) {
      showError('Email required', 'Select a user or enter a registered user email.');
      return;
    }
    setBusy(true);
    try {
      await adminApi.recordManualPayment({
        email,
        amount: Math.max(0, Number(manualPayForm.amount) || 0),
        method: manualPayForm.method || 'manual',
        paymentId: manualPayForm.paymentId.trim() || undefined,
        grantPro: manualPayForm.grantPro,
      });
      setManualPayOpen(false);
      const r = await adminApi.payments(paymentQuery);
      setPayments(r.data?.payments || []);
      setSubscriptions(r.data?.subscriptions || []);
      if (r.data?.stats) setPaymentStats(r.data.stats);
      notify('Payment recorded', `Recorded payment for ${email}${manualPayForm.grantPro ? ' and unlocked PRO' : ''}.`, 'Payment recorded');
    } catch (err: any) {
      showError('Could not record payment', err?.response?.data?.message || err?.message || 'Check the user email and try again.');
    } finally { setBusy(false); }
  };

  const saveAccount = async () => {
    if (!accountForm.currentPassword) {
      showError('Current password required', 'Enter your current admin password to confirm changes.');
      return;
    }
    setBusy(true);
    try {
      const payload: any = { currentPassword: accountForm.currentPassword };
      if (accountForm.email.trim()) payload.email = accountForm.email.trim();
      if (accountForm.displayName.trim()) payload.displayName = accountForm.displayName.trim();
      if (accountForm.newPassword) payload.newPassword = accountForm.newPassword;
      const r = await adminApi.updateAccount(payload);
      setAccountForm({
        email: String(r.data.email || ''),
        displayName: String(r.data.displayName || 'Admin'),
        currentPassword: '', newPassword: '',
      });
      notify(
        'Admin account updated',
        r.data.passwordChanged
          ? 'Login email, name and password updated. Use the new details next time you sign in.'
          : 'Login email and name updated.',
        'Admin account updated'
      );
    } catch (e: any) {
      showError('Could not update account', e?.response?.data?.message || 'Check your current password and try again.');
    } finally { setBusy(false); }
  };

  /** Show a visual error banner (Web + native) alongside native Alert. */
  const showError = (title: string, message: string) => {
    setToast({ tone: 'err', title, message });
    Alert.alert(title, message);
  };

  /** App-wide confirmation: visual toast + alert + spoken notification sound. */
  const notify = (title: string, message: string, spoken: string) => {
    setToast({ tone: 'ok', title, message });
    Alert.alert(title, message);
    try {
      Speech.stop();
      Speech.speak(spoken, { language: 'en', rate: 1, pitch: 1.05 });
    } catch { /* notification sound is optional */ }
  };

  const filteredPlans = plans.filter((p) => {
    const q = planQuery.trim().toLowerCase();
    return (!q || (p.name || '').toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q))
      && (planLevel === 'all' || Number(p.level) === Number(planLevel));
  });

  const previewExercise = exercises.find((e) => form.exerciseIds.includes(e.id));
  const previewActionId = previewExercise?.action_id || null;
  const previewUri = form.lottieUrl.trim() || previewExercise?.lottie_path || null;
  const cover = COVERS[Math.max(0, CATEGORIES.indexOf(form.category)) % COVERS.length];

  // Dashboard values respect the admin's selected time basis.
  const activePeriod = period === 'all' ? null : (overview?.periods?.[period] || {});
  const kpis = {
    users: period === 'all' ? (overview?.users ?? 0) : (activePeriod?.newUsers ?? 0),
    plans: overview?.plans ?? 0,
    sessions: period === 'all' ? (overview?.sessions ?? 0) : (activePeriod?.sessions ?? 0),
    points: period === 'all' ? (overview?.totalPoints ?? 0) : (activePeriod?.points ?? 0),
    minutes: period === 'all' ? (overview?.totalMinutes ?? 0) : (activePeriod?.minutes ?? 0),
    calories: period === 'all' ? (overview?.totalCalories ?? 0) : (activePeriod?.calories ?? 0),
  };
  const periodLabel = PERIODS.find((p) => p.key === period)?.label || 'Last 7 days';

  const weekAgo = Date.now() - 7 * 864e5;
  const filteredUsers = users
    .filter((u) => {
      if (userFilter === 'pro') return !!u.is_pro;
      if (userFilter === 'free') return !u.is_pro;
      if (userFilter === 'new') return new Date(u.created_at).getTime() >= weekAgo;
      return true;
    })
    .sort((a, b) => {
      if (userSort === 'points') return Number(b.points || 0) - Number(a.points || 0);
      if (userSort === 'workouts') return Number(b.sessions || 0) - Number(a.sessions || 0);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  const filteredLibrary = libraryItems.filter((e) =>
    !libraryQuery || (e.name || '').toLowerCase().includes(libraryQuery.toLowerCase()));
  const proCount = users.filter((u) => !!u.is_pro).length;
  const newCount = users.filter((u) => new Date(u.created_at).getTime() >= weekAgo).length;

  const filteredPayments = payments
    .filter((p) => paymentFilter === 'all' || paymentGroup(p.status) === paymentFilter)
    .sort((a, b) => paymentSort === 'amount'
      ? Number(b.amount || 0) - Number(a.amount || 0)
      : new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const paymentCounts = {
    success: payments.filter((p) => paymentGroup(p.status) === 'success').length,
    pending: payments.filter((p) => paymentGroup(p.status) === 'pending').length,
    failed: payments.filter((p) => paymentGroup(p.status) === 'failed').length,
  };
  const successRate = paymentStats.total
    ? Math.round(((paymentStats.successful || paymentCounts.success) / paymentStats.total) * 100) : 0;
  const activity: any[] = overview?.activity || [];
  const trend: any[] = overview?.trend || [];
  const topUsers: any[] = overview?.topUsers || [];
  const topPlans: any[] = overview?.topPlans || [];
  const paymentSummary = overview?.payments || { total: 0, successful: 0, revenue: 0, currency: 'INR' };
  const recentPayments: any[] = overview?.recentPayments || [];
  const clock = useMemo(() => clockText(now), [now]);
  const syncText = useMemo(() => clockText(syncedAt || now), [syncedAt, now]);
  const todaySessions = overview?.periods?.today?.sessions ?? 0;

  const leave = async () => { await signOut(); resetTo('Auth'); };

  return (
    <SafeAreaView style={styles.root}>
      <GradientBox radius={22} colors={['#0B1E4D', '#004AFF']} style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.adminPill}>
            <Icon name="crown" size={11} color="#FFC84A" />
            <Text style={styles.adminPillText}>ADMIN CONTROL</Text>
          </View>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE · {clock}</Text>
          </View>
        </View>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>CONTROL CENTER</Text>
            <Text style={styles.title}>Admin panel</Text>
            <Text style={styles.headerSub}>Manage workouts, users and rewards</Text>
          </View>
        </View>
        <View style={styles.controlRow}>
          <TouchableOpacity onPress={() => setTab('settings')} style={styles.controlBtn}>
            <Icon name="settings" size={17} color={colors.white} />
            <Text style={styles.controlBtnText}>SETTINGS</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={leave} style={[styles.controlBtn, styles.controlBtnDanger]}>
            <Icon name="logout" size={17} color={colors.white} />
            <Text style={styles.controlBtnText}>LOGOUT</Text>
          </TouchableOpacity>
        </View>
      </GradientBox>

      {!!toast && (
        <View style={[styles.toastBanner, toast.tone === 'err' && styles.toastBannerErr]}>
          <Icon name={toast.tone === 'err' ? 'close' : 'check'} size={15} color={toast.tone === 'err' ? colors.danger : '#117A45'} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.toastTitle, toast.tone === 'err' && { color: colors.danger }]}>{toast.title}</Text>
            <Text style={styles.toastMsg} numberOfLines={2}>{toast.message}</Text>
          </View>
          <TouchableOpacity onPress={() => setToast(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="close" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        {tab === 'overview' && (
          <>
            <View style={styles.tabHead}>
              <View>
                <Text style={styles.tabHeadKicker}>DASHBOARD</Text>
                <Text style={styles.tabHeadTitle}>Overview</Text>
              </View>
              <TouchableOpacity onPress={load} style={styles.refreshBtn}>
                <Icon name="clock" size={15} color={colors.primary} />
                <Text style={styles.refreshText}>{clock}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.liveBanner}>
              <View style={styles.liveBannerDot} />
              <Text style={styles.liveBannerText}>
                {todaySessions > 0
                  ? `${todaySessions} workout${todaySessions === 1 ? '' : 's'} completed today`
                  : 'No workouts completed today yet'}
              </Text>
              <Text style={styles.liveBannerMeta}>UPDATED {syncText}</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodTabs}>
              {PERIODS.map((p) => (
                <TouchableOpacity key={p.key} onPress={() => setPeriod(p.key)}
                  style={[styles.periodTab, period === p.key && styles.periodTabActive]}>
                  <Text style={[styles.periodTabText, period === p.key && styles.periodTabTextActive]}>{p.tab}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.periodHint}>Showing {periodLabel.toLowerCase()} data · synced {syncText} · tap the clock to refresh</Text>

            <View style={styles.statGrid}>
              <AdminStat label="Users" value={kpis.users} icon="user"
                sub={period === 'all' ? 'registered accounts' : `new in ${periodLabel.toLowerCase()}`} />
              <AdminStat label="Workouts" value={kpis.plans} icon="dumbbell"
                sub="in catalogue" tint="#E7F8EF" tone={colors.success} />
              <AdminStat label="Sessions" value={kpis.sessions} icon="check"
                sub={`${kpis.minutes} min trained`} tint="#FFF1E4" tone="#F2760E" />
              <AdminStat label="Fire points" value={formatPoints(kpis.points)} icon="flame"
                sub={`${activePeriod?.pointEntries ?? overview?.pointEntries ?? 0} entries`} tint="#FFF0D6" tone="#B48600" />
            </View>

            <View style={styles.miniCard}>
              <View style={styles.miniCardHead}>
                <Icon name="veryActive" size={16} color={colors.primary} />
                <Text style={styles.miniCardTitle}>Platform pulse</Text>
                <View style={styles.miniCardBadge}><Text style={styles.miniCardBadgeText}>LIVE</Text></View>
              </View>
              <View style={styles.miniGrid}>
                <MiniStat icon="user" value={overview?.activeUsers ?? 0} label="Active 7d" tint="#E7F8EF" tone={colors.success} />
                <MiniStat icon="crown" value={overview?.proUsers ?? 0} label="PRO users" tint="#FFF0D6" tone="#B48600" />
                <MiniStat icon="clock" value={kpis.minutes} label="Minutes" tint="#EAF0FF" tone={colors.primary} />
                <MiniStat icon="flame" value={kpis.calories} label="kcal burned" tint="#FFF1E4" tone="#F2760E" />
              </View>
            </View>

            <View style={styles.card}>
              <TouchableOpacity style={styles.cardHead} onPress={() => setTab('payments')}>
                <View style={styles.cardHeadLeft}>
                  <View style={[styles.cardIcon, { backgroundColor: '#FFF0D6' }]}>
                    <Icon name="crown" size={16} color="#B48600" />
                  </View>
                  <View>
                    <Text style={styles.cardTitle}>Payments</Text>
                    <Text style={styles.cardSub}>Revenue and latest transactions · tap for all</Text>
                  </View>
                </View>
                <Icon name="chevron" size={16} color={colors.textMuted} />
              </TouchableOpacity>
              <View style={styles.payHomeRow}>
                <View style={styles.payHomeTile}>
                  <Text style={styles.payHomeValue}>{formatMoney(paymentSummary.revenue, paymentSummary.currency)}</Text>
                  <Text style={styles.payHomeLabel}>Revenue</Text>
                </View>
                <View style={styles.payHomeTile}>
                  <Text style={styles.payHomeValue}>{paymentSummary.successful || 0}</Text>
                  <Text style={styles.payHomeLabel}>Completed</Text>
                </View>
                <View style={styles.payHomeTile}>
                  <Text style={styles.payHomeValue}>{paymentSummary.total || 0}</Text>
                  <Text style={styles.payHomeLabel}>Attempts</Text>
                </View>
              </View>
              {recentPayments.map((p) => (
                <TouchableOpacity key={p.id} style={styles.activityRow} onPress={() => setTab('payments')}>
                  <View style={[styles.activityIcon, { backgroundColor: '#E7F8EF' }]}>
                    <Icon name="check" size={15} color={colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityTitle} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.activitySub} numberOfLines={1}>{statusStyle(p.status).label} · {timeAgo(p.time, now)}</Text>
                  </View>
                  <Text style={styles.activityValue}>{formatMoney(p.amount, p.currency)}</Text>
                </TouchableOpacity>
              ))}
              {!recentPayments.length && <Text style={styles.empty}>No payments yet.</Text>}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.cardHeadLeft}>
                  <View style={styles.cardIcon}><Icon name="veryActive" size={16} color={colors.primary} /></View>
                  <View>
                    <Text style={styles.cardTitle}>Activity trend</Text>
                    <Text style={styles.cardSub}>Workouts completed · last 7 days</Text>
                  </View>
                </View>
                <Text style={styles.cardRight}>{trend.reduce((n, d) => n + (Number(d.sessions) || 0), 0)} total</Text>
              </View>
              <TrendBars trend={trend} />
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.cardHeadLeft}>
                  <View style={[styles.cardIcon, { backgroundColor: '#FFF1E4' }]}>
                    <Icon name="flame" size={16} color="#F2760E" />
                  </View>
                  <View>
                    <Text style={styles.cardTitle}>Live activity</Text>
                    <Text style={styles.cardSub}>Latest workouts, users and points</Text>
                  </View>
                </View>
                <Text style={styles.cardRight}>REAL TIME</Text>
              </View>
              {activity.slice(0, 8).map((item, i) => (
                <ActivityRow key={`${item.type}-${item.time}-${i}`} item={item} now={now} />
              ))}
              {!activity.length && <Text style={styles.empty}>No activity yet.</Text>}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.cardHeadLeft}>
                  <View style={[styles.cardIcon, { backgroundColor: '#FFF0D6' }]}>
                    <Icon name="trophy" size={16} color="#B48600" />
                  </View>
                  <View>
                    <Text style={styles.cardTitle}>Top performers</Text>
                    <Text style={styles.cardSub}>Most fire points earned</Text>
                  </View>
                </View>
                <Text style={styles.cardRight}>TOP 5</Text>
              </View>
              {topUsers.map((u, i) => (
                <TouchableOpacity key={u.id} style={styles.rankRow} onPress={() => openUser({ id: u.id, display_name: u.name, points: u.points, sessions: u.sessions, is_pro: u.isPro })}>
                  <View style={[styles.rankBadge, i === 0 && styles.rankBadgeFirst]}>
                    <Text style={styles.rankText}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityTitle} numberOfLines={1}>{u.name}</Text>
                    <Text style={styles.activitySub} numberOfLines={1}>{u.sessions} workouts · {formatPoints(u.points)} pts</Text>
                  </View>
                  {!!u.isPro && <View style={styles.proMini}><Text style={styles.proMiniText}>PRO</Text></View>}
                  <Icon name="chevron" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
              {!topUsers.length && <Text style={styles.empty}>No users yet.</Text>}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHead}>
                <View style={styles.cardHeadLeft}>
                  <View style={styles.cardIcon}><Icon name="dumbbell" size={16} color={colors.primary} /></View>
                  <View>
                    <Text style={styles.cardTitle}>Popular workouts</Text>
                    <Text style={styles.cardSub}>Most completed plans</Text>
                  </View>
                </View>
                <Text style={styles.cardRight}>TOP 5</Text>
              </View>
              {topPlans.map((p, i) => (
                <TouchableOpacity key={p.id} style={styles.rankRow} onPress={() => setTab('plans')}>
                  <View style={[styles.rankBadge, i === 0 && styles.rankBadgeFirst]}>
                    <Text style={styles.rankText}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityTitle} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.activitySub} numberOfLines={1}>{p.category} · L{p.level} · {p.sessions} workouts</Text>
                  </View>
                  <Icon name="chevron" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
              {!topPlans.length && <Text style={styles.empty}>No workouts yet.</Text>}
            </View>

            <View style={styles.totalsCard}>
              <View style={styles.totalsHead}>
                <View style={styles.totalsIcon}><Icon name="award" size={18} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.totalsTitle}>Platform totals</Text>
                  <Text style={styles.totalsSub}>Lifetime activity across all users</Text>
                </View>
                <View style={styles.totalsBadge}><Text style={styles.totalsBadgeText}>ALL TIME</Text></View>
              </View>
              <View style={styles.totalsRow}>
                <TotalTile icon="clock" value={overview?.totalMinutes ?? 0} label="Training min" tint="#EAF0FF" color={colors.primary} />
                <TotalTile icon="flame" value={overview?.totalCalories ?? 0} label="kcal burned" tint="#FFF1E4" color="#F2760E" />
                <TotalTile icon="trophy" value={overview?.pointEntries ?? 0} label="Point entries" tint="#FFF7DF" color="#B48600" />
              </View>
              <View style={styles.totalsFoot}>
                <Text style={styles.totalsFootItem}>{overview?.completionRate ?? 0}% completion</Text>
                <Text style={styles.totalsFootItem}>{overview?.exercises ?? 0} exercises</Text>
                <Text style={styles.totalsFootItem}>{formatPoints(overview?.totalReps ?? 0)} reps</Text>
              </View>
            </View>
          </>
        )}

        {tab === 'users' && (
          <>
            <View style={styles.tabHead}>
              <View>
                <Text style={styles.tabHeadKicker}>USER MANAGEMENT</Text>
                <Text style={styles.tabHeadTitle}>All users</Text>
              </View>
              <TouchableOpacity onPress={load} style={styles.refreshBtn}>
                <Icon name="clock" size={15} color={colors.primary} />
                <Text style={styles.refreshText}>{clock}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.miniCard}>
              <View style={styles.miniCardHead}>
                <Icon name="user" size={16} color={colors.primary} />
                <Text style={styles.miniCardTitle}>User base</Text>
                <View style={styles.miniCardBadge}><Text style={styles.miniCardBadgeText}>LIVE</Text></View>
              </View>
              <View style={styles.miniGrid}>
                <MiniStat icon="user" value={userStats?.users ?? users.length} label="Total" tint="#EAF0FF" tone={colors.primary} />
                <MiniStat icon="crown" value={userStats?.proUsers ?? proCount} label="PRO" tint="#FFF0D6" tone="#B48600" />
                <MiniStat icon="veryActive" value={userStats?.activeUsers ?? 0} label="Active 7d" tint="#E7F8EF" tone={colors.success} />
                <MiniStat icon="plus" value={userStats?.periods?.week?.newUsers ?? newCount} label="New 7d" tint="#FFF1E4" tone="#F2760E" />
              </View>
              <View style={styles.proShareTrack}>
                <View style={[styles.proShareFill, {
                  width: `${userStats?.users ? Math.min(100, ((userStats.proUsers || 0) / userStats.users) * 100) : 0}%`,
                }]} />
              </View>
              <Text style={styles.proShareText}>
                {userStats?.users ? Math.round(((userStats.proUsers || 0) / userStats.users) * 100) : 0}% of users are PRO members
              </Text>
            </View>

            <View style={styles.searchRow}>
              <Icon name="search" size={17} color={colors.textMuted} />
              <TextInput style={styles.search} placeholder="Search user email or name"
                placeholderTextColor={colors.textMuted} value={query} onChangeText={setQuery}
                returnKeyType="search" clearButtonMode="while-editing" />
              {!!query && (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon name="close" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterTabs}>
              {([
                { key: 'all', label: 'All', count: users.length },
                { key: 'pro', label: 'PRO', count: proCount },
                { key: 'free', label: 'Free', count: users.length - proCount },
                { key: 'new', label: 'New 7d', count: newCount },
              ] as const).map((f) => (
                <TouchableOpacity key={f.key} onPress={() => setUserFilter(f.key)}
                  style={[styles.tab, userFilter === f.key && styles.tabActive]}>
                  <Text style={[styles.tabText, userFilter === f.key && styles.tabTextActive]}>
                    {f.label} · {f.count}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.sortRow}>
              <Text style={styles.sortLabel}>SORT</Text>
              {([
                { key: 'newest', label: 'Newest' },
                { key: 'points', label: 'Points' },
                { key: 'workouts', label: 'Workouts' },
              ] as const).map((s) => (
                <TouchableOpacity key={s.key} onPress={() => setUserSort(s.key)}
                  style={[styles.sortChip, userSort === s.key && styles.sortChipActive]}>
                  <Text style={[styles.sortChipText, userSort === s.key && styles.sortChipTextActive]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {!!usersError && (
              <View style={styles.detailErrorBox}>
                <Text style={styles.detailErrorText}>{usersError}</Text>
                <TouchableOpacity onPress={load} style={styles.detailRetryBtn}>
                  <Text style={styles.detailRetryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.searchResult}>
              {!!query ? `Found ${filteredUsers.length} for “${query}” · ` : ''}Showing {filteredUsers.length} of {users.length} users
            </Text>

            {filteredUsers.map((u, i) => {
              const progress = Math.min(100, (Number(u.points || 0) / Math.max(1, pointsTarget)) * 100);
              const uAvatar = u.avatar_url ? (resolveAssetUrl(u.avatar_url) || u.avatar_url) : null;
              return (
                <TouchableOpacity key={u.id} style={styles.userCard} onPress={() => openUser(u)}>
                  <View style={[styles.avatar, { backgroundColor: AVATAR_TINTS[i % AVATAR_TINTS.length] }]}>
                    {uAvatar ? (
                      <Image source={{ uri: uAvatar }} style={styles.avatarImg} />
                    ) : (
                      <Text style={[styles.avatarText, { color: AVATAR_TONES[i % AVATAR_TONES.length] }]}>
                        {(u.display_name || u.email || 'U').charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameLine}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{u.display_name || 'User'}</Text>
                      {!!u.is_pro && <View style={styles.proMini}><Text style={styles.proMiniText}>PRO</Text></View>}
                    </View>
                    <Text style={styles.rowSub} numberOfLines={1}>{u.email || 'No email'}</Text>
                    <View style={styles.userMeta}>
                      <Meta label={`${u.sessions || 0} workouts`} />
                      <Meta label={`${formatPoints(u.points || 0)} pts`} />
                      <Meta label={u.last_active ? `Active ${timeAgo(u.last_active)}` : 'New user'} />
                    </View>
                    <View style={styles.userProgressTrack}>
                      <View style={[styles.userProgressFill, { width: `${progress}%` }]} />
                    </View>
                    <Text style={styles.userProgressHint}>{Math.round(progress)}% to PRO reward</Text>
                  </View>
                  <View style={styles.userRight}>
                    <View style={styles.viewPill}><Text style={styles.viewPillText}>VIEW</Text></View>
                    <Icon name="chevron" size={16} color={colors.primary} />
                  </View>
                </TouchableOpacity>
              );
            })}
            {!filteredUsers.length && <Text style={styles.empty}>No users found.</Text>}
          </>
        )}

        {tab === 'plans' && (
          <>
            <View style={styles.tabHead}>
              <View>
                <Text style={styles.tabHeadKicker}>WORKOUT CATALOGUE</Text>
                <Text style={styles.tabHeadTitle}>Plans & prices</Text>
              </View>
              <View style={styles.countPill}><Text style={styles.countText}>{filteredPlans.length}</Text></View>
            </View>

            {/* Workout Audio Gap Check & Generator card */}
            {(() => {
              const summary = audioGapReport?.summary;
              const missingEx = Number(summary?.exercisesMissingAudio ?? 0);
              const totalPlansCount = Number(summary?.totalPlans ?? plans.length);
              const readyPlansCount = Number(summary?.readyPlans ?? plans.filter((p) => Number(p.distinct_exercises || 0) > 0 && Number(p.audio_ready_exercises || 0) >= Number(p.distinct_exercises || 0)).length);
              const allReady = summary ? missingEx === 0 && Number(summary.plansWithGaps || 0) === 0 : readyPlansCount >= totalPlansCount && totalPlansCount > 0;
              return (
                <View style={[styles.audioGapCard, allReady ? styles.audioGapCardOk : styles.audioGapCardWarn]}>
                  <View style={styles.audioGapTop}>
                    <View style={[styles.audioGapIcon, { backgroundColor: allReady ? '#E7F8EF' : '#FFF0D6' }]}>
                      <Icon name="bell" size={16} color={allReady ? colors.success : '#B48600'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.audioGapTitle}>
                        {allReady ? 'All workout audio ready' : `${missingEx} exercise audio gap${missingEx === 1 ? '' : 's'} detected`}
                      </Text>
                      <Text style={styles.audioGapSub}>
                        {summary
                          ? `${readyPlansCount}/${totalPlansCount} workouts · ${summary.exercisesWithAudio}/${summary.totalExercises} exercises have voice cues`
                          : `${readyPlansCount}/${totalPlansCount} workouts covered`}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.audioGapActions}>
                    <TouchableOpacity
                      onPress={() => checkAndGenerateWorkoutAudio(true)}
                      disabled={audioBusy}
                      style={styles.audioGapBtnSecondary}
                    >
                      <Text style={styles.audioGapBtnSecondaryText}>{audioBusy ? 'CHECKING…' : 'CHECK GAPS'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => checkAndGenerateWorkoutAudio(false)}
                      disabled={audioBusy}
                      style={styles.audioGapBtnPrimary}
                    >
                      {audioBusy
                        ? <ActivityIndicator size="small" color={colors.white} />
                        : <Text style={styles.audioGapBtnPrimaryText}>{allReady ? 'RE-CHECK & APPLY' : 'GENERATE & APPLY'}</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })()}

            <View style={styles.searchRow}>
              <Icon name="search" size={17} color={colors.textMuted} />
              <TextInput style={styles.search} placeholder="Search workouts"
                placeholderTextColor={colors.textMuted} value={planQuery} onChangeText={setPlanQuery}
                returnKeyType="search" clearButtonMode="while-editing" />
              {!!planQuery && (
                <TouchableOpacity onPress={() => setPlanQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon name="close" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
              {([
                { key: 'all', label: 'All' }, { key: '1', label: 'Beginner' },
                { key: '2', label: 'Intermediate' }, { key: '3', label: 'Advanced' },
              ] as const).map((l) => (
                <TouchableOpacity key={l.key} onPress={() => setPlanLevel(l.key)}
                  style={[styles.tab, planLevel === l.key && styles.tabActive]}>
                  <Text style={[styles.tabText, planLevel === l.key && styles.tabTextActive]}>{l.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {filteredPlans.map((p) => (
              <TouchableOpacity key={p.id} style={styles.planCard} onPress={() => editPlanInBuilder(p.id)}>
                <View style={styles.planIcon}><Icon name="dumbbell" size={18} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>{p.code} · {p.category}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <Text style={[styles.rowSub, { marginTop: 0 }]}>{p.total_exercises} exercises · {Math.round((p.duration_sec || 0) / 60)} min</Text>
                    {Number(p.distinct_exercises || 0) > 0 && (
                      <View style={[
                        styles.planAudioChip,
                        Number(p.audio_ready_exercises || 0) < Number(p.distinct_exercises || 0) && styles.planAudioChipGap,
                      ]}>
                        <Text style={[
                          styles.planAudioChipText,
                          Number(p.audio_ready_exercises || 0) < Number(p.distinct_exercises || 0) && styles.planAudioChipTextGap,
                        ]}>
                          {Number(p.audio_ready_exercises || 0) >= Number(p.distinct_exercises || 0)
                            ? '♪ AUDIO'
                            : `♪ ${Number(p.distinct_exercises) - Number(p.audio_ready_exercises || 0)} GAP`}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.planRight}>
                  <View style={styles.levelPill}><Text style={styles.levelPillText}>L{p.level}</Text></View>
                  <View style={styles.priceChip}>
                    <Text style={styles.priceChipText}>{p.price_cents ? formatMoney(p.price_cents / 100, settingsForm.paymentCurrency || 'INR') : 'FREE'}</Text>
                  </View>
                  <Text style={styles.editHint}>BUILD</Text>
                </View>
              </TouchableOpacity>
            ))}
            {!filteredPlans.length && <Text style={styles.empty}>No workouts found.</Text>}
          </>
        )}

        {tab === 'upload' && (
          <>
            <View style={styles.tabHead}>
              <View>
                <Text style={styles.tabHeadKicker}>WORKOUT BUILDER</Text>
                <Text style={styles.tabHeadTitle}>{editingPlanId ? 'Edit workout' : 'Create workout'}</Text>
              </View>
              {editingPlanId ? (
                <TouchableOpacity onPress={resetBuilder} style={styles.refreshBtn}>
                  <Icon name="plus" size={15} color={colors.primary} />
                  <Text style={styles.refreshText}>NEW</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.countPill}><Text style={styles.countText}>{form.exerciseIds.length}</Text></View>
              )}
            </View>

            <View style={styles.previewCard}>
              <Image source={form.coverImage ? { uri: form.coverImage } : cover} resizeMode="cover" style={styles.previewImage} />
              <View style={styles.previewShade} />
              <View style={styles.previewTop}>
                <View style={styles.previewLevel}>
                  <Text style={styles.previewLevelText}>{['', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'][form.level]}</Text>
                </View>
                <View style={styles.previewPrice}>
                  <Text style={styles.previewPriceText}>{form.priceCents ? formatMoney(form.priceCents / 100, settingsForm.paymentCurrency || 'INR') : 'FREE'}</Text>
                </View>
              </View>
              <View style={styles.previewBottom}>
                <Text style={styles.previewTitle} numberOfLines={2}>{form.name.trim() || 'Untitled workout'}</Text>
                <Text style={styles.previewMeta}>{form.durationSec} min · {form.exerciseIds.length} exercises · {dayName}</Text>
              </View>
              {!!(previewExercise || previewUri) && (
                <View style={styles.previewAnim} pointerEvents="none">
                  <ExerciseArt actionId={previewActionId} uri={previewUri} size={88} glyph="◆" />
                </View>
              )}
            </View>

            <View style={styles.card}>
              <StepHeader step="1" title="Workout details" icon="dumbbell" />
              <Field label="Workout name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Field label="Code (auto-generated, editable)" value={form.code} onChange={(v) => setForm({ ...form, code: v })} />
              <Field label="Description shown to users" value={form.description} multiline
                onChange={(v) => setForm({ ...form, description: v })} />
              <Field label="Category — type your own or pick below" value={form.category}
                onChange={(v) => setForm({ ...form, category: v })} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity key={c} onPress={() => setForm({ ...form, category: c })}
                    style={[styles.tab, form.category === c && styles.tabActive]}>
                    <Text style={[styles.tabText, form.category === c && styles.tabTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.card}>
              <StepHeader step="2" title="Level, duration & price" icon="target" />
              <Text style={styles.fieldLabel}>Level</Text>
              <View style={styles.rowBetween}>
                {[1, 2, 3].map((l) => (
                  <TouchableOpacity key={l} onPress={() => setForm({ ...form, level: l })}
                    style={[styles.levelChip, form.level === l && styles.levelChipActive]}>
                    <Text style={[styles.tabText, form.level === l && styles.tabTextActive]}>{['', 'Beginner', 'Intermediate', 'Advanced'][l]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Field label="Duration (minutes)" value={String(form.durationSec)} keyboardType="numeric"
                onChange={(v) => setForm({ ...form, durationSec: Number(v) || 0 })} />
              <Field label="Price (INR, 0 = free)" value={String(form.priceCents / 100)} keyboardType="numeric"
                onChange={(v) => setForm({ ...form, priceCents: Math.round((Number(v) || 0) * 100) })} />
              <Text style={styles.fieldLabel}>Cover image / animation (upload only)</Text>
              <View style={styles.animActionRow}>
                <TouchableOpacity onPress={uploadCoverImage} disabled={busy} style={styles.animActionBtn}>
                  <Icon name="plus" size={15} color={colors.primary} />
                  <Text style={styles.animActionText}>UPLOAD COVER IMAGE</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setCoverPickerOpen(true)} style={styles.animActionBtn}>
                  <Icon name="dumbbell" size={15} color={colors.primary} />
                  <Text style={styles.animActionText}>FROM LIBRARY</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.libraryBadges}>
                <View style={[styles.animMini, !form.coverImage && styles.badgeOff]}>
                  <Text style={styles.animMiniText}>{form.coverImage ? 'COVER READY' : 'NO COVER'}</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <StepHeader step="3" title="Exercises, timing & animation" icon="flame" />

              {/* Day name */}
              <Field label="Day name (e.g. Lower Body Day-1)" value={dayName} onChange={setDayName} />

              {/* Open library CTA */}
              <TouchableOpacity style={styles.exLibCta} onPress={() => setLibraryOpen(true)} activeOpacity={0.82}>
                <View style={styles.exLibCtaIcon}>
                  <Icon name="dumbbell" size={18} color={colors.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exLibCtaTitle}>Open Exercise library</Text>
                  <Text style={styles.exLibCtaSub}>Add · edit animation, description & coach tips</Text>
                </View>
                <Icon name="chevron" size={16} color={colors.primary} />
              </TouchableOpacity>

              {/* Search bar */}
              <View style={styles.exSearchRow}>
                <Icon name="search" size={15} color={colors.textMuted} />
                <TextInput
                  style={styles.search}
                  placeholder="Filter exercises by name…"
                  placeholderTextColor={colors.textMuted}
                  value={exerciseQuery}
                  onChangeText={setExerciseQuery}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                />
                {!!exerciseQuery && (
                  <TouchableOpacity onPress={() => setExerciseQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Icon name="close" size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Count / hint */}
              {exercises.length > 0 ? (
                <View style={styles.exCountRow}>
                  <View style={styles.exCountPill}>
                    <Text style={styles.exCountText}>{exercises.length} exercises</Text>
                  </View>
                  <Text style={styles.exCountHint}>
                    {form.exerciseIds.length > 0
                      ? `${form.exerciseIds.length} selected · tap to reorder`
                      : 'Tap + ADD to include in this workout'}
                  </Text>
                </View>
              ) : (
                <View style={styles.exEmptyHint}>
                  <Icon name="dumbbell" size={15} color={colors.textMuted} />
                  <Text style={styles.exEmptyText}>Open the library above and tap + ADD to build this workout.</Text>
                </View>
              )}

              {/* Selected order summary */}
              {form.exerciseIds.length > 0 && (
                <View style={styles.exOrderBox}>
                  <View style={styles.exOrderHead}>
                    <Icon name="flame" size={13} color={colors.primary} />
                    <Text style={styles.exOrderTitle}>WORKOUT ORDER · {form.exerciseIds.length}</Text>
                  </View>
                  {form.exerciseIds.map((id, i) => {
                    const e = exercises.find((x) => Number(x.id) === Number(id));
                    return (
                      <View key={id} style={styles.exOrderRow}>
                        <View style={styles.exOrderNum}><Text style={styles.exOrderNumText}>{i + 1}</Text></View>
                        <ExerciseArt actionId={e?.action_id} uri={e?.lottie_path} size={26} />
                        <Text style={[styles.exerciseName, { flex: 1 }]} numberOfLines={1}>
                          {e?.name || `Exercise ${id}`}
                        </Text>
                        <View style={styles.exOrderTimePill}>
                          <Text style={styles.exOrderTimeText}>{itemSettings[id]?.timeSec || 30}s</Text>
                        </View>
                        <Pressable
                          onPressIn={() => removeExercise(id)}
                          style={({ pressed }) => [styles.exOrderRemove, pressed && styles.pressed]}
                        >
                          <Icon name="minus" size={12} color={colors.danger} />
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Exercise cards list */}
              <View style={styles.exerciseList}>
                {(showAllEx || !!exerciseQuery.trim() ? exercises : exercises.slice(0, 15)).map((e) => {
                  const on = form.exerciseIds.some((x) => Number(x) === Number(e.id));
                  const idx = form.exerciseIds.findIndex((x) => Number(x) === Number(e.id));
                  const cfg = itemSettings[e.id] || { timeSec: 30, restSec: 10, rounds: 1 };
                  const setCfg = (patch: any) => setItemSettings((s) => ({ ...s, [e.id]: { ...cfg, ...patch } }));
                  const move = (dir: number) => {
                    const ids = [...form.exerciseIds];
                    const target = idx + dir;
                    if (target < 0 || target >= ids.length) return;
                    [ids[idx], ids[target]] = [ids[target], ids[idx]];
                    setForm({ ...form, exerciseIds: ids });
                  };
                  return (
                    <View key={e.id} style={[styles.exCard, on && styles.exCardOn]}>
                      {/* Top row */}
                      <TouchableOpacity
                        style={styles.exCardMain}
                        onPress={() => (on ? removeExercise(e.id) : addExercise(e.id))}
                        activeOpacity={0.78}
                      >
                        <View style={[styles.exCardThumb, on && styles.exCardThumbOn]}>
                          <ExerciseArt actionId={e.action_id} uri={e.lottie_path} size={34} glyph="◆" />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'nowrap' }}>
                            {!!e.has_animation && <Text style={styles.animBadge}>▶</Text>}
                            <Text style={styles.exerciseName} numberOfLines={1}>{e.name}</Text>
                            <View style={styles.exLevelPill}><Text style={styles.exLevelPillText}>L{e.level}</Text></View>
                          </View>
                          <Text style={styles.exerciseSub} numberOfLines={1}>
                            {on
                              ? `${cfg.timeSec}s · ${cfg.restSec}s rest · ×${cfg.rounds}`
                              : (e.primary_muscle || 'full body')}
                          </Text>
                        </View>
                        {on && (
                          <View style={styles.exOrderBadge}>
                            <Text style={styles.exOrderBadgeText}>#{idx + 1}</Text>
                          </View>
                        )}
                      </TouchableOpacity>

                      {/* Right-side action buttons */}
                      <View style={styles.exCardActions}>
                        {!e.has_animation && !e.lottie_path && (
                          <TouchableOpacity onPress={() => addAnimationTo(e)} style={styles.exAnimPill}>
                            <Text style={styles.exAnimPillText}>+ANIM</Text>
                          </TouchableOpacity>
                        )}
                        <Pressable
                          style={({ pressed }) => [styles.exToggleBtn, on && styles.exToggleBtnOn, pressed && styles.pressed]}
                          onPressIn={() => (on ? removeExercise(e.id) : addExercise(e.id))}
                        >
                          <Icon name={on ? 'minus' : 'plus'} size={13} color={on ? colors.danger : colors.white} />
                          <Text style={[styles.exToggleText, on && styles.exToggleTextOn]}>
                            {on ? 'REMOVE' : 'ADD'}
                          </Text>
                        </Pressable>
                      </View>

                      {/* Timing row (expanded when selected) */}
                      {on && (
                        <View style={styles.exTimingRow}>
                          <View style={styles.exTimingField}>
                            <Text style={styles.exTimingLabel}>TIME (s)</Text>
                            <TextInput
                              style={styles.exTimingInput}
                              keyboardType="numeric"
                              value={String(cfg.timeSec)}
                              onChangeText={(v) => setCfg({ timeSec: Number(v) || 0 })}
                            />
                          </View>
                          <View style={styles.exTimingDivider} />
                          <View style={styles.exTimingField}>
                            <Text style={styles.exTimingLabel}>REST (s)</Text>
                            <TextInput
                              style={styles.exTimingInput}
                              keyboardType="numeric"
                              value={String(cfg.restSec)}
                              onChangeText={(v) => setCfg({ restSec: Number(v) || 0 })}
                            />
                          </View>
                          <View style={styles.exTimingDivider} />
                          <View style={styles.exTimingField}>
                            <Text style={styles.exTimingLabel}>ROUNDS</Text>
                            <TextInput
                              style={styles.exTimingInput}
                              keyboardType="numeric"
                              value={String(cfg.rounds)}
                              onChangeText={(v) => setCfg({ rounds: Number(v) || 1 })}
                            />
                          </View>
                          <View style={styles.exTimingDivider} />
                          <View style={styles.exReorderBtns}>
                            <TouchableOpacity onPress={() => move(-1)} style={styles.exReorderBtn}>
                              <Text style={styles.exReorderBtnText}>↑</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => move(1)} style={styles.exReorderBtn}>
                              <Text style={styles.exReorderBtnText}>↓</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
                {!showAllEx && !exerciseQuery.trim() && exercises.length > 15 && (
                  <TouchableOpacity onPress={() => setShowAllEx(true)} style={[styles.secondary, { marginTop: 6, flex: 0 }]}>
                    <Text style={styles.secondaryText}>Show all {exercises.length} exercises (+{exercises.length - 15} more)</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

          </>
        )}

        {tab === 'payments' && (
          <>
            <View style={styles.tabHead}>
              <View>
                <Text style={styles.tabHeadKicker}>TRANSACTIONS</Text>
                <Text style={styles.tabHeadTitle}>Payments</Text>
              </View>
              <View style={styles.payHeadRight}>
                <TouchableOpacity onPress={openManualPayment} style={styles.addPayBtn}>
                  <Icon name="plus" size={14} color={colors.white} />
                  <Text style={styles.addPayText}>RECORD</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={load} style={styles.refreshBtn}>
                  <Icon name="clock" size={15} color={colors.primary} />
                  <Text style={styles.refreshText}>{clock}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {!!paymentsError && (
              <View style={styles.detailErrorBox}>
                <Text style={styles.detailErrorText}>{paymentsError}</Text>
                <TouchableOpacity onPress={load} style={styles.detailRetryBtn}>
                  <Text style={styles.detailRetryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.gatewayBanner,
                (paymentFlags.keyIdConfigured && paymentFlags.secretConfigured) && styles.gatewayBannerOk,
              ]}
              onPress={() => setTab('settings')}
              activeOpacity={0.8}
            >
              <Icon
                name={(paymentFlags.keyIdConfigured && paymentFlags.secretConfigured) ? 'check' : 'lock'}
                size={15}
                color={(paymentFlags.keyIdConfigured && paymentFlags.secretConfigured) ? '#117A45' : '#B48600'}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.gatewayTitle}>
                  {!(paymentFlags.keyIdConfigured && paymentFlags.secretConfigured)
                    ? 'Razorpay gateway not configured'
                    : paymentFlags.demoMode
                      ? 'Razorpay demo key active'
                      : 'Razorpay live gateway connected'}
                </Text>
                <Text style={styles.gatewaySub}>
                  {!(paymentFlags.keyIdConfigured && paymentFlags.secretConfigured)
                    ? 'Tap to add Razorpay Key ID & Secret in Settings, or tap + RECORD for manual payments'
                    : paymentFlags.demoMode
                      ? `Test checkout active (${paymentFlags.keyIdPreview || 'rzp_test_demo'}) — replace with real keys in Settings anytime`
                      : `Online PRO checkouts active (${paymentStats.currency || settingsForm.paymentCurrency || 'INR'})`}
                </Text>
              </View>
              <Icon name="chevron" size={15} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.miniCard}>
              <View style={styles.miniCardHead}>
                <Icon name="crown" size={16} color="#B48600" />
                <Text style={styles.miniCardTitle}>Revenue pulse</Text>
                <View style={styles.miniCardBadge}><Text style={styles.miniCardBadgeText}>LIVE</Text></View>
              </View>
              <View style={styles.miniGrid}>
                <MiniStat icon="crown" value={compactMoney(paymentStats.revenue, paymentStats.currency || settingsForm.paymentCurrency)} label="Total" tint="#FFF0D6" tone="#B48600" />
                <MiniStat icon="check" value={paymentStats.successful || 0} label="Completed" tint="#E7F8EF" tone={colors.success} />
                <MiniStat icon="veryActive" value={`${successRate}%`} label="Success rate" tint="#EAF0FF" tone={colors.primary} />
                <MiniStat icon="calendar" value={compactMoney(paymentStats.todayRevenue, paymentStats.currency || settingsForm.paymentCurrency)} label="Today" tint="#FFF1E4" tone="#F2760E" />
              </View>
              <View style={styles.proShareTrack}>
                <View style={[styles.proShareFill, { width: `${successRate}%`, backgroundColor: colors.success }]} />
              </View>
              <Text style={styles.proShareText}>{paymentStats.todayCount || 0} payments completed today</Text>
            </View>

            <View style={styles.searchRow}>
              <Icon name="search" size={17} color={colors.textMuted} />
              <TextInput style={styles.search} placeholder="Search user, payment or order ID"
                placeholderTextColor={colors.textMuted} value={paymentQuery} onChangeText={setPaymentQuery}
                returnKeyType="search" clearButtonMode="while-editing" />
              {!!paymentQuery && (
                <TouchableOpacity onPress={() => setPaymentQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon name="close" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterTabs}>
              {([
                { key: 'all', label: 'All', count: payments.length },
                { key: 'success', label: 'Success', count: paymentCounts.success },
                { key: 'pending', label: 'Pending', count: paymentCounts.pending },
                { key: 'failed', label: 'Failed', count: paymentCounts.failed },
              ] as const).map((f) => (
                <TouchableOpacity key={f.key} onPress={() => setPaymentFilter(f.key)}
                  style={[styles.tab, paymentFilter === f.key && styles.tabActive]}>
                  <Text style={[styles.tabText, paymentFilter === f.key && styles.tabTextActive]}>
                    {f.label} · {f.count}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.sortRow}>
              <Text style={styles.sortLabel}>SORT</Text>
              {([
                { key: 'newest', label: 'Newest' },
                { key: 'amount', label: 'Amount' },
              ] as const).map((s) => (
                <TouchableOpacity key={s.key} onPress={() => setPaymentSort(s.key)}
                  style={[styles.sortChip, paymentSort === s.key && styles.sortChipActive]}>
                  <Text style={[styles.sortChipText, paymentSort === s.key && styles.sortChipTextActive]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.searchResult}>
              {!!paymentQuery ? `Found ${filteredPayments.length} · ` : ''}Showing {filteredPayments.length} of {payments.length} payments
            </Text>

            {filteredPayments.map((p, i) => {
              const s = statusStyle(p.status);
              const group = paymentGroup(p.status);
              const icon = group === 'success' ? 'check' : group === 'pending' ? 'clock' : 'close';
              return (
                <TouchableOpacity key={p.id} style={styles.paymentCard} onPress={() => setDetailPayment(p)}>
                  <View style={styles.paymentTop}>
                    <View style={[styles.paymentAvatar, { backgroundColor: s.bg }]}>
                      <Icon name={icon} size={18} color={s.fg} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{p.display_name || 'User'}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>{p.email || p.plan_name}</Text>
                    </View>
                    <View style={styles.paymentAmount}>
                      <Text style={styles.paymentAmountText}>{formatMoney(p.amount, p.currency)}</Text>
                      <View style={[styles.statusChip, { backgroundColor: s.bg }]}>
                        <Text style={[styles.statusChipText, { color: s.fg }]}>{s.label}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.paymentMeta}>
                    <Text style={styles.paymentMetaText}>{p.gateway} · {p.method || '—'}</Text>
                    <Text style={styles.paymentMetaText}>{timeAgo(p.created_at, now)}</Text>
                  </View>
                  <View style={styles.paymentIds}>
                    <Text style={styles.paymentIdText} numberOfLines={1}>#{i + 1} · {p.payment_id || p.order_id || '—'}</Text>
                    <View style={styles.viewPill}><Text style={styles.viewPillText}>DETAILS</Text></View>
                  </View>
                </TouchableOpacity>
              );
            })}
            {!filteredPayments.length && (
              <Text style={styles.empty}>
                {payments.length ? 'No payments match this filter.' : 'No checkout payments yet. Tap + RECORD above or configure Razorpay keys.'}
              </Text>
            )}

            <View style={[styles.card, { marginTop: spacing.md }]}>
              <View style={styles.cardHead}>
                <View style={styles.cardHeadLeft}>
                  <View style={[styles.cardIcon, { backgroundColor: '#FFF0D6' }]}>
                    <Icon name="crown" size={16} color="#B48600" />
                  </View>
                  <View>
                    <Text style={styles.cardTitle}>PRO memberships ({subscriptions.length})</Text>
                    <Text style={styles.cardSub}>Active &amp; manual PRO accounts · tap to view user</Text>
                  </View>
                </View>
              </View>
              {subscriptions.map((sub) => (
                <TouchableOpacity
                  key={sub.id}
                  style={styles.rankRow}
                  onPress={() => openUser({ id: sub.user_id, display_name: sub.display_name, email: sub.email, is_pro: sub.active })}
                >
                  <View style={[styles.activityIcon, { backgroundColor: sub.active ? '#E7F8EF' : colors.canvas }]}>
                    <Icon name="crown" size={15} color={sub.active ? '#117A45' : colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityTitle} numberOfLines={1}>{sub.display_name || sub.email || `User #${sub.user_id}`}</Text>
                    <Text style={styles.activitySub} numberOfLines={1}>
                      {sub.email ? `${sub.email} · ` : ''}{sub.platform || 'manual'}
                      {sub.expires_at ? ` · Exp ${new Date(sub.expires_at).toLocaleDateString()}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.statusChip, { backgroundColor: sub.active ? '#E7F8EF' : '#FFE9E9' }]}>
                    <Text style={[styles.statusChipText, { color: sub.active ? '#117A45' : colors.danger }]}>
                      {sub.active ? 'ACTIVE' : 'INACTIVE'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
              {!subscriptions.length && <Text style={styles.empty}>No PRO memberships yet.</Text>}
            </View>
          </>
        )}

        {tab === 'settings' && (
          <>
            <View style={styles.tabHead}>
              <View>
                <Text style={styles.tabHeadKicker}>CONFIGURATION</Text>
                <Text style={styles.tabHeadTitle}>Rewards & PRO</Text>
              </View>
              <View style={styles.countPill}><Icon name="settings" size={15} color={colors.primary} /></View>
            </View>

            <View style={styles.card}>
              <StepHeader step="★" title="Fire-points target" icon="flame" />
              <Field label="Points needed for PRO reward" value={settingsForm.pointsTarget}
                keyboardType="numeric" onChange={(v) => setSettingsForm({ ...settingsForm, pointsTarget: v })} />
              <Text style={styles.animHint}>Change it any time — e.g. 800. Every user's progress bar and reward badge update automatically.</Text>
            </View>

            <View style={styles.card}>
              <StepHeader step="P" title="PRO pricing" icon="crown" />
              <Field label="PRO discount (%)" value={settingsForm.discountPercent}
                keyboardType="numeric" onChange={(v) => setSettingsForm({ ...settingsForm, discountPercent: v })} />
              <Field label="PRO yearly price (INR)" value={(Number(settingsForm.proPriceCents) / 100).toFixed(2)}
                keyboardType="numeric" onChange={(v) => setSettingsForm({ ...settingsForm, proPriceCents: String(Math.round((Number(v) || 0) * 100)) })} />
              <Text style={styles.animHint}>Change it any time. After Save, the new price shows on every user's PRO screen and is used for Razorpay checkout immediately — no app restart or re-login needed.</Text>
            </View>

            <View style={styles.card}>
              <StepHeader step="R" title="Razorpay payment keys" icon="lock" />
              <View style={styles.keyStatusRow}>
                <View style={[styles.keyChip, paymentFlags.keyIdConfigured && styles.keyChipOn]}>
                  <Icon name={paymentFlags.keyIdConfigured ? 'check' : 'close'} size={12}
                    color={paymentFlags.keyIdConfigured ? colors.success : colors.textMuted} />
                  <Text style={[styles.keyChipText, paymentFlags.keyIdConfigured && styles.keyChipTextOn]}>
                    {paymentFlags.demoMode ? `Demo Key (${paymentFlags.keyIdPreview || 'rzp_test_demo'})` : paymentFlags.keyIdConfigured ? 'Live Key ID set' : 'Key ID missing'}
                  </Text>
                </View>
                <View style={[styles.keyChip, paymentFlags.secretConfigured && styles.keyChipOn]}>
                  <Icon name={paymentFlags.secretConfigured ? 'check' : 'close'} size={12}
                    color={paymentFlags.secretConfigured ? colors.success : colors.textMuted} />
                  <Text style={[styles.keyChipText, paymentFlags.secretConfigured && styles.keyChipTextOn]}>
                    {paymentFlags.demoMode ? 'Demo secret active' : paymentFlags.secretConfigured ? 'Secret set' : 'Secret missing'}
                  </Text>
                </View>
              </View>
              <Field label="Razorpay key ID (rzp_test_... or rzp_live_... to enable real checkout)" value={settingsForm.razorpayKeyId}
                onChange={(v) => setSettingsForm({ ...settingsForm, razorpayKeyId: v })} />
              <Field label="Razorpay key secret (write only)" value={settingsForm.razorpayKeySecret}
                secure onChange={(v) => setSettingsForm({ ...settingsForm, razorpayKeySecret: v })} />
              <Field label="Payment currency (INR default)" value={settingsForm.paymentCurrency}
                onChange={(v) => setSettingsForm({ ...settingsForm, paymentCurrency: v })} />
              <Text style={styles.animHint}>
                {paymentFlags.demoMode
                  ? 'Demo key is currently active. Paste your real Razorpay Key ID (rzp_test_... or rzp_live_...) and Secret above and tap SAVE SETTINGS to open the live Razorpay checkout sheet.'
                  : 'Persisted safely on the server. Leave blank to keep the active live Razorpay keys unchanged.'}
              </Text>
            </View>

            <View style={styles.card}>
              <StepHeader step="V" title="App version & update link" icon="bell" />
              <Field label="Latest app version (e.g. 1.0.2)" value={settingsForm.latestAppVersion}
                onChange={(v) => setSettingsForm({ ...settingsForm, latestAppVersion: v })} />
              <Field label="Update APK / store URL" value={settingsForm.appUpdateUrl}
                onChange={(v) => setSettingsForm({ ...settingsForm, appUpdateUrl: v })} />
              <Text style={styles.animHint}>When set to a newer version than an installed app (e.g. 1.0.2 over 1.0.1), users see an "Update app" banner that updates right over their existing install.</Text>
            </View>

            <View style={styles.card}>
              <StepHeader step="H" title="Help & support contact" icon="info" />
              <Field label="Support email" value={settingsForm.supportEmail} keyboardType="email-address"
                onChange={(v) => setSettingsForm({ ...settingsForm, supportEmail: v })} />
              <Field label="Support phone" value={settingsForm.supportPhone} keyboardType="phone-pad"
                onChange={(v) => setSettingsForm({ ...settingsForm, supportPhone: v })} />
              <Field label="Support address" value={settingsForm.supportAddress}
                onChange={(v) => setSettingsForm({ ...settingsForm, supportAddress: v })} />
              <Text style={styles.animHint}>Shown in the app's PRO and support screens. Updates for all users as soon as you save.</Text>
            </View>

            <View style={styles.card}>
              <StepHeader step="A" title="Admin account" icon="lock" />
              <Field label="Login email (username)" value={accountForm.email} keyboardType="email-address"
                onChange={(v) => setAccountForm({ ...accountForm, email: v })} />
              <Field label="Display name" value={accountForm.displayName}
                onChange={(v) => setAccountForm({ ...accountForm, displayName: v })} />
              <Field label="Current password" value={accountForm.currentPassword} secure
                onChange={(v) => setAccountForm({ ...accountForm, currentPassword: v })} />
              <Field label="New password (blank = keep)" value={accountForm.newPassword} secure
                onChange={(v) => setAccountForm({ ...accountForm, newPassword: v })} />
              <TouchableOpacity onPress={saveAccount} disabled={busy} style={styles.accountSaveBtn}>
                {busy
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.accountSaveText}>UPDATE ADMIN ACCOUNT</Text>}
              </TouchableOpacity>
              <Text style={styles.animHint}>Current password is required. A new password is stored as a hash in .env and used the next time you sign in.</Text>
            </View>

          </>
        )}
      </ScrollView>

      {/* Sticky action button — never overlaps the form or bottom nav */}
      {(tab === 'upload' || tab === 'settings') && (
        <View style={styles.actionFooter}>
          <GradientBox radius={22} style={styles.uploadWrap} colors={['#0075FF', '#004AFF']}>
            <TouchableOpacity
              onPress={tab === 'upload' ? saveWorkout : saveSettings}
              disabled={busy || (tab === 'upload' && !form.name.trim())}
              style={styles.uploadBtn}
            >
              {busy ? <ActivityIndicator color={colors.white} /> : (
                <>
                  <Icon name={tab === 'upload' ? 'plus' : 'check'} size={18} color={colors.white} />
                  <Text style={styles.uploadText}>{tab === 'upload' ? 'SAVE WORKOUT' : 'SAVE SETTINGS'}</Text>
                </>
              )}
            </TouchableOpacity>
          </GradientBox>
        </View>
      )}

      {/* User-style bottom navigation — admin screens behind each button */}
      <View style={styles.bottomNav}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTab(t.key)}
            style={styles.navItem}
          >
            <View style={[styles.navIcon, tab === t.key && styles.navIconActive]}>
              <Icon name={t.icon} size={20} color={tab === t.key ? colors.white : colors.textMuted} />
            </View>
            <Text style={[styles.navText, tab === t.key && styles.navTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Edit plan modal */}
      <Modal visible={!!editPlan} transparent animationType="fade" onRequestClose={() => setEditPlan(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.sectionTitle}>Edit workout</Text>
            <Field label="Name" value={editName} onChange={setEditName} />
            <Field label="Price (INR)" value={editPrice} keyboardType="numeric" onChange={setEditPrice} />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setEditPlan(null)} style={styles.secondary}><Text style={styles.secondaryText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={savePlan} style={styles.primary}><Text style={styles.primaryText}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* User detail modal */}
      <Modal visible={userOpen} transparent animationType="slide" onRequestClose={() => setUserOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modalBig}>
            <GradientBox radius={22} colors={['#0B1E4D', '#004AFF']} style={styles.detailHero}>
              <TouchableOpacity onPress={() => setUserOpen(false)} style={styles.detailClose}>
                <Icon name="close" size={18} color={colors.white} />
              </TouchableOpacity>
              <View style={styles.detailAvatar}>
                {detail?.user?.avatar_url ? (
                  <Image
                    source={{ uri: resolveAssetUrl(detail.user.avatar_url) || detail.user.avatar_url }}
                    style={styles.detailAvatarImg}
                  />
                ) : (
                  <Text style={styles.detailAvatarText}>
                    {(detail?.user?.display_name || detail?.user?.email || 'U').charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
              <Text style={styles.detailName} numberOfLines={1}>{detail?.user?.display_name || 'User'}</Text>
              <Text style={styles.detailEmail} numberOfLines={1}>
                {detail?.user?.email || (detailLoading ? 'Loading email…' : 'No email')}
                {detail?.user?.created_at ? ` · Joined ${new Date(detail.user.created_at).toLocaleDateString()}` : ''}
              </Text>
              {!!detail?.user?.is_pro && (
                <View style={styles.detailPro}><Icon name="crown" size={11} color="#FFC84A" /><Text style={styles.detailProText}>PRO MEMBER</Text></View>
              )}
            </GradientBox>

            {detailLoading && (
              <View style={styles.detailLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.detailLoadingText}>Loading full history…</Text>
              </View>
            )}
            {!!detailError && !detailLoading && (
              <View style={styles.detailErrorBox}>
                <Text style={styles.detailErrorText}>{detailError}</Text>
                <TouchableOpacity onPress={() => openUser(detail?.user)} style={styles.detailRetryBtn}>
                  <Text style={styles.detailRetryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
            <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailBody}>
              <View style={styles.detailStatRow}>
                <DetailStat icon="check" value={detail?.progress?.sessions ?? 0} label="Workouts" />
                <DetailStat icon="clock" value={detail?.progress?.minutes ?? 0} label="Minutes" />
                <DetailStat icon="flame" value={detail?.progress?.calories ?? 0} label="kcal" />
                <DetailStat icon="trophy" value={formatPoints(detail?.user?.points || 0)} label="Points" />
              </View>

              <DetailSection icon="dumbbell" title={`Workout history (${detail?.workouts?.length || 0})`}>
                {(detail?.workouts || []).map((w: any) => (
                  <DetailRow key={w.id} icon="check" title={w.title || 'Workout'}
                    sub={`${Math.round((w.duration_sec || 0) / 60)} min · ${w.status || 'completed'}`} right={`${w.exercises_done || 0} ex`} />
                ))}
                {!detail?.workouts?.length && <Text style={styles.empty}>No workouts yet.</Text>}
              </DetailSection>

              <DetailSection icon="target" title={`Active plans (${detail?.plans?.length || 0})`}>
                {(detail?.plans || []).map((p: any) => (
                  <DetailRow key={p.id} icon="play" title={p.name || 'Workout plan'}
                    sub={`${p.category || 'workout'} · L${p.level || 1}`} right={`Day ${p.current_day || 0}`} />
                ))}
                {!detail?.plans?.length && <Text style={styles.empty}>No active plans.</Text>}
              </DetailSection>

              <DetailSection icon="award" title={`Achievements (${(detail?.achievements || []).filter((a: any) => !!a.unlocked_at).length} unlocked)`}>
                {(detail?.achievements || []).filter((a: any) => !!a.unlocked_at).map((a: any) => (
                  <DetailRow key={a.achievement_id} icon="award" title={`Achievement #${a.achievement_id}`}
                    sub={`Unlocked ${new Date(a.unlocked_at).toLocaleDateString()}`} right={`Prog ${a.progress || 0}`} />
                ))}
                {!(detail?.achievements || []).some((a: any) => !!a.unlocked_at) && (
                  <Text style={styles.empty}>No unlocked achievements yet.</Text>
                )}
              </DetailSection>

              <DetailSection icon="flame" title="Point history">
                {(detail?.pointsLedger || []).slice(0, 15).map((l: any) => (
                  <DetailRow key={l.id} icon="flame" title={l.reason || 'Points awarded'}
                    sub={l.created_at ? new Date(l.created_at).toLocaleDateString() : ''} right={`+${l.points}`} />
                ))}
                {!detail?.pointsLedger?.length && <Text style={styles.empty}>No points earned yet.</Text>}
              </DetailSection>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Exercise library modal */}
      <Modal visible={libraryOpen} transparent animationType="slide" onRequestClose={() => setLibraryOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.editorModal}>
            {/* ── Header ── */}
            <GradientBox radius={0} colors={['#0B1E4D', '#1A3AFF']} style={styles.libHeader}>
              <View style={styles.libHeaderTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.libHeaderKicker}>ADMIN · EXERCISE LIBRARY</Text>
                  <Text style={styles.libHeaderTitle}>Exercise library</Text>
                </View>
                <View style={styles.libCountBubble}>
                  <Text style={styles.libCountNum}>{filteredLibrary.length}</Text>
                  <Text style={styles.libCountSub}>exercises</Text>
                </View>
                <TouchableOpacity onPress={() => setLibraryOpen(false)} style={styles.libCloseBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Icon name="close" size={16} color="rgba(255,255,255,0.85)" />
                </TouchableOpacity>
              </View>
              <Text style={styles.libHeaderSub}>Tap any exercise to edit animation, description, steps &amp; coach tips.</Text>
            </GradientBox>

            {/* ── Search ── */}
            <View style={styles.libSearchWrap}>
              <View style={styles.libSearchRow}>
                <Icon name="search" size={16} color={colors.textMuted} />
                <TextInput
                  style={styles.search}
                  placeholder="Search by name or muscle…"
                  placeholderTextColor={colors.textMuted}
                  value={libraryQuery}
                  onChangeText={setLibraryQuery}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                />
                {!!libraryQuery && (
                  <TouchableOpacity onPress={() => setLibraryQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Icon name="close" size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* ── List ── */}
            <ScrollView
              style={styles.libraryScroll}
              contentContainerStyle={styles.libListContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {libraryLoading ? (
                <View style={styles.libLoadingBox}>
                  <ActivityIndicator color={colors.primary} size="large" />
                  <Text style={styles.libLoadingText}>Loading exercises…</Text>
                </View>
              ) : filteredLibrary.length === 0 ? (
                <View style={styles.libEmptyBox}>
                  <View style={styles.libEmptyIcon}>
                    <Icon name="dumbbell" size={28} color={colors.primary} />
                  </View>
                  <Text style={styles.libEmptyTitle}>No exercises found</Text>
                  <Text style={styles.libEmptySub}>
                    {libraryQuery ? `No results for "${libraryQuery}" — try a different keyword.` : 'Add your first exercise using the button below.'}
                  </Text>
                </View>
              ) : (
                filteredLibrary.map((e, i) => {
                  const hasAnim = !!(e.has_animation || e.lottie_path || e.action_id);
                  const muscle = e.primary_muscle || 'full body';
                  return (
                    <TouchableOpacity
                      key={e.id}
                      style={[styles.libExRow, i === filteredLibrary.length - 1 && styles.libExRowLast]}
                      onPress={() => openExerciseEditor(e.id)}
                      activeOpacity={0.72}
                    >
                      {/* Thumbnail */}
                      <View style={styles.libExThumb}>
                        <ExerciseArt actionId={e.action_id} uri={e.lottie_path} size={36} glyph="◆" />
                      </View>

                      {/* Name + meta */}
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.libExNameRow}>
                          <Text style={styles.libExName} numberOfLines={1}>{e.name}</Text>
                          <View style={styles.libExLevelPill}>
                            <Text style={styles.libExLevelText}>L{e.level}</Text>
                          </View>
                        </View>
                        <View style={styles.libExMetaRow}>
                          <View style={styles.libExMusclePill}>
                            <Text style={styles.libExMuscleText} numberOfLines={1}>{muscle}</Text>
                          </View>
                          {hasAnim ? (
                            <View style={styles.libExAnimBadge}>
                              <Text style={styles.libExAnimText}>▶ ANIM</Text>
                            </View>
                          ) : (
                            <TouchableOpacity style={styles.libExNoAnimBadge} onPress={() => { setLibraryOpen(false); addAnimationTo(e); }}>
                              <Text style={styles.libExNoAnimText}>+ ADD ANIM</Text>
                            </TouchableOpacity>
                          )}
                          {(e.has_audio || e.audio_url) ? (
                            <View style={styles.libExAudioBadge}>
                              <Text style={styles.libExAudioText}>♪ AUDIO</Text>
                            </View>
                          ) : (
                            <View style={styles.libExNoAudioBadge}>
                              <Text style={styles.libExNoAudioText}>NO AUDIO</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Edit chevron */}
                      <View style={styles.libExEditPill}>
                        <Text style={styles.libExEditText}>EDIT</Text>
                        <Icon name="chevron" size={13} color={colors.primary} />
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            {/* ── Footer ── */}
            <View style={styles.libFooter}>
              <TouchableOpacity
                onPress={() => openExerciseEditor()}
                style={styles.libAddBtn}
                activeOpacity={0.85}
              >
                <View style={styles.libAddIcon}>
                  <Icon name="plus" size={18} color={colors.white} />
                </View>
                <Text style={styles.libAddBtnText}>ADD NEW EXERCISE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cover image picker from uploaded exercise animations */}
      <Modal visible={coverPickerOpen} transparent animationType="slide" onRequestClose={() => setCoverPickerOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.editorModal}>
            <View style={styles.editorHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Choose a cover animation</Text>
                <Text style={styles.editorSub}>Previously uploaded by the admin · tap to use</Text>
              </View>
              <TouchableOpacity onPress={() => setCoverPickerOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.libraryScroll} contentContainerStyle={styles.editorContent}>
              {libraryItems.filter((e) => !!e.lottie_path).map((e, i) => (
                <TouchableOpacity key={e.id} style={styles.libraryCard}
                  onPress={() => { setForm((f) => ({ ...f, coverImage: e.lottie_path })); setCoverPickerOpen(false); }}>
                  <View style={[styles.libraryThumb, { backgroundColor: AVATAR_TINTS[i % AVATAR_TINTS.length] }]}>
                    <ExerciseArt actionId={e.action_id} uri={e.lottie_path} size={40} />
                  </View>
                  <Text style={[styles.exerciseName, { flex: 1 }]} numberOfLines={1}>{e.name}</Text>
                  <View style={styles.viewPill}><Text style={styles.viewPillText}>USE</Text></View>
                </TouchableOpacity>
              ))}
              {!libraryItems.some((e) => !!e.lottie_path) && <Text style={styles.empty}>No uploaded animations yet.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Bundled animation picker */}
      <Modal visible={animationPickerOpen} transparent animationType="slide" onRequestClose={() => { setAnimationPickerOpen(false); setAnimationTarget(null); }}>
        <View style={styles.backdrop}>
          <View style={styles.modalBig}>
            <View style={styles.modalHead}>
              <Text style={styles.sectionTitle}>
                {animationTarget ? `Add animation · ${animationTarget.name}` : `App animations · ${BUNDLED_ANIMATION_IDS.length}`}
              </Text>
              <TouchableOpacity onPress={() => { setAnimationPickerOpen(false); setAnimationTarget(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.animHint}>Tap an animation to use the exact same character artwork as the app. No upload needed.</Text>
            <ScrollView style={styles.kvScroll}>
              <View style={styles.animGrid}>
                {BUNDLED_ANIMATION_IDS.map((id) => (
                  <TouchableOpacity key={id} onPress={() => chooseBundledAnimation(id)}
                    style={[styles.animGridItem, String(exerciseForm.actionId) === String(id) && styles.animThumbOn]}>
                    <ExerciseArt actionId={id} size={52} />
                    <Text style={styles.animThumbLabel}>{id}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Exercise editor modal */}
      <Modal visible={exerciseEditorOpen} transparent animationType="slide" onRequestClose={() => setExerciseEditorOpen(false)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.editorModal}>
            <View style={styles.editorHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>{editingExerciseId ? 'Edit exercise' : 'New exercise'}</Text>
                <Text style={styles.editorSub}>Animation · sound · description · steps · coach tips</Text>
              </View>
              <TouchableOpacity onPress={() => setExerciseEditorOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.editorScroll}
              contentContainerStyle={styles.editorContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Field label="Exercise name (e.g. Jumping Jacks)" value={exerciseForm.name}
                onChange={(v) => setExerciseForm({ ...exerciseForm, name: v })} />
              <Field label="Action ID (blank = auto)" value={exerciseForm.actionId} keyboardType="numeric"
                onChange={(v) => setExerciseForm({ ...exerciseForm, actionId: v })} />
              <Field label="Slug (optional)" value={exerciseForm.slug}
                onChange={(v) => setExerciseForm({ ...exerciseForm, slug: v })} />
              <Field label="Level (1-4)" value={exerciseForm.level} keyboardType="numeric"
                onChange={(v) => setExerciseForm({ ...exerciseForm, level: v })} />
              <Field label="Primary muscle" value={exerciseForm.primaryMuscle}
                onChange={(v) => setExerciseForm({ ...exerciseForm, primaryMuscle: v })} />
              <Field label="Equipment (none, bench, dumbbell, band, towel)" value={exerciseForm.equipment}
                onChange={(v) => setExerciseForm({ ...exerciseForm, equipment: v })} />
              <Field label="Unit (s, reps, km)" value={exerciseForm.unit}
                onChange={(v) => setExerciseForm({ ...exerciseForm, unit: v })} />
              <Text style={styles.fieldLabel}>Animation</Text>
              <View style={styles.animActionRow}>
                <TouchableOpacity onPress={() => setAnimationPickerOpen(true)} style={styles.animActionBtn}>
                  <Icon name="play" size={15} color={colors.primary} />
                  <Text style={styles.animActionText}>BROWSE APP ANIMATIONS</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={uploadAnimationFile} disabled={busy} style={styles.animActionBtn}>
                  <Icon name="plus" size={15} color={colors.primary} />
                  <Text style={styles.animActionText}>UPLOAD ANIMATION</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.animStrip}>
                {BUNDLED_ANIMATION_IDS.slice(0, 24).map((id) => (
                  <TouchableOpacity key={id} onPress={() => chooseBundledAnimation(id)}
                    style={[styles.animThumb, String(exerciseForm.actionId) === String(id) && styles.animThumbOn]}>
                    <ExerciseArt actionId={id} size={44} />
                    <Text style={styles.animThumbLabel}>{id}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.libraryBadges}>
                <View style={[styles.animMini, !exerciseForm.lottieUrl && !exerciseForm.actionId && styles.badgeOff]}>
                  <Text style={styles.animMiniText}>{exerciseForm.lottieUrl || exerciseForm.actionId ? '▶ ANIMATION READY' : 'NO ANIMATION'}</Text>
                </View>
              </View>
              <Text style={styles.animHint}>Pick a bundled character animation (same look as the app) or upload a Lottie JSON / GIF file. No URL typing needed.</Text>
              <Text style={styles.fieldLabel}>Sound cue</Text>
              <View style={styles.animActionRow}>
                <TouchableOpacity onPress={generateSingleExerciseAudio} disabled={busy || audioBusy} style={styles.animActionBtn}>
                  <Icon name="flame" size={15} color={colors.primary} />
                  <Text style={styles.animActionText}>{audioBusy ? 'GENERATING…' : 'AUTO-GENERATE AUDIO'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={uploadSoundFile} disabled={busy || audioBusy} style={styles.animActionBtn}>
                  <Icon name="bell" size={15} color={colors.primary} />
                  <Text style={styles.animActionText}>UPLOAD SOUND</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.libraryBadges, { alignItems: 'center', marginTop: 6 }]}>
                <View style={[styles.soundMini, !exerciseForm.audioUrl && styles.badgeOff]}>
                  <Text style={styles.soundMiniText}>{exerciseForm.audioUrl ? '♪ SOUND READY' : 'NO SOUND'}</Text>
                </View>
                {!!exerciseForm.audioUrl && (
                  <TouchableOpacity onPress={() => previewSoundUrl(exerciseForm.audioUrl)} style={styles.previewAudioPill}>
                    <Icon name="play" size={11} color={colors.white} />
                    <Text style={styles.previewAudioText}>PREVIEW AUDIO</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.animHint}>Plays when this exercise starts in a workout. If empty, the app speaks the exercise name instead.</Text>
              <Field label="Description / big heading text" value={exerciseForm.description} multiline
                onChange={(v) => setExerciseForm({ ...exerciseForm, description: v })} />
              <Field label="Steps (one per line)" value={exerciseForm.steps} multiline
                onChange={(v) => setExerciseForm({ ...exerciseForm, steps: v })} />
              <Field label="Coach tips (one per line)" value={exerciseForm.coachTips} multiline
                onChange={(v) => setExerciseForm({ ...exerciseForm, coachTips: v })} />
              <Text style={styles.animHint}>Everything here is saved on the server and appears in the user's exercise detail screen — animation, description, steps and coach tips.</Text>
            </ScrollView>
            <View style={styles.editorFooter}>
              <TouchableOpacity onPress={saveExercise} disabled={busy || !exerciseForm.name.trim()} style={styles.modalPrimaryBtn}>
                {busy
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.primaryText}>SAVE EXERCISE</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Full payment detail modal */}
      <Modal visible={!!detailPayment} transparent animationType="fade" onRequestClose={() => setDetailPayment(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <View style={styles.modalHead}>
              <Text style={styles.sectionTitle}>Payment details</Text>
              <TouchableOpacity onPress={() => setDetailPayment(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.kvScroll}>
              <PaymentKV label="Status" value={statusStyle(detailPayment?.status).label} />
              <PaymentKV label="Amount" value={formatMoney(detailPayment?.amount || 0, detailPayment?.currency)} />
              <PaymentKV label="User" value={detailPayment?.display_name || detailPayment?.email} />
              <PaymentKV label="Email" value={detailPayment?.email} />
              <PaymentKV label="Plan" value={detailPayment?.plan_name || detailPayment?.product_id} />
              <PaymentKV label="Gateway" value={detailPayment?.gateway} />
              <PaymentKV label="Payment ID" value={detailPayment?.payment_id} />
              <PaymentKV label="Order ID" value={detailPayment?.order_id} />
              <PaymentKV label="Payment link ID" value={detailPayment?.payment_link_id} />
              <PaymentKV label="Method" value={detailPayment?.method} />
              <PaymentKV label="Discount" value={`${detailPayment?.discount_percent || 0}%`} />
              <PaymentKV label="Points at purchase" value={formatPoints(detailPayment?.points_at_purchase || 0)} />
              <PaymentKV label="Date" value={detailPayment?.created_at ? new Date(detailPayment.created_at).toLocaleString() : '—'} />
              <PaymentKV label="Record #" value={detailPayment?.id} />
            </ScrollView>
            <TouchableOpacity onPress={() => setDetailPayment(null)} style={styles.modalPrimaryBtn}>
              <Text style={styles.primaryText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Record manual payment / activate PRO modal */}
      <Modal visible={manualPayOpen} transparent animationType="fade" onRequestClose={() => setManualPayOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
          <View style={styles.modal}>
            <View style={styles.modalHead}>
              <Text style={styles.sectionTitle}>Record payment</Text>
              <TouchableOpacity onPress={() => setManualPayOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Icon name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.kvScroll} keyboardShouldPersistTaps="handled">
              {users.length > 0 && (
                <>
                  <Text style={styles.fieldLabel}>Quick pick user</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
                    {users.slice(0, 12).map((u) => {
                      const active = manualPayForm.email.toLowerCase() === String(u.email || '').toLowerCase();
                      return (
                        <TouchableOpacity
                          key={u.id}
                          onPress={() => setManualPayForm((f) => ({ ...f, email: u.email || '' }))}
                          style={[styles.sortChip, active && styles.sortChipActive]}
                        >
                          <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>
                            {u.display_name || u.email}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              )}
              <Field label="User email" value={manualPayForm.email} keyboardType="email-address"
                onChange={(v) => setManualPayForm({ ...manualPayForm, email: v })} />
              <Field label={`Amount (${paymentStats.currency || settingsForm.paymentCurrency || 'INR'})`}
                value={manualPayForm.amount} keyboardType="numeric"
                onChange={(v) => setManualPayForm({ ...manualPayForm, amount: v })} />
              <Text style={styles.fieldLabel}>Payment method</Text>
              <View style={styles.payMethodRow}>
                {(['upi', 'cash', 'bank', 'manual'] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setManualPayForm({ ...manualPayForm, method: m })}
                    style={[styles.sortChip, manualPayForm.method === m && styles.sortChipActive]}
                  >
                    <Text style={[styles.sortChipText, manualPayForm.method === m && styles.sortChipTextActive]}>
                      {m.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Field label="Reference / Transaction ID (optional)" value={manualPayForm.paymentId}
                onChange={(v) => setManualPayForm({ ...manualPayForm, paymentId: v })} />
              <TouchableOpacity
                onPress={() => setManualPayForm({ ...manualPayForm, grantPro: !manualPayForm.grantPro })}
                style={styles.grantProToggle}
              >
                <View style={[styles.grantProCheck, manualPayForm.grantPro && styles.grantProCheckOn]}>
                  {manualPayForm.grantPro && <Icon name="check" size={12} color={colors.white} />}
                </View>
                <Text style={styles.grantProText}>Activate 1-year PRO membership for this user</Text>
              </TouchableOpacity>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setManualPayOpen(false)} style={styles.secondary}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveManualPayment} disabled={busy} style={styles.primary}>
                {busy
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={styles.primaryText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function StepHeader({ step, title, icon }: { step: string; title: string; icon: any }) {
  return (
    <View style={styles.stepHead}>
      <View style={styles.stepBadge}><Text style={styles.stepText}>{step}</Text></View>
      <Icon name={icon} size={17} color={colors.primary} />
      <Text style={styles.stepTitle}>{title}</Text>
    </View>
  );
}

function AdminStat({ label, value, icon, sub, tint, tone }: {
  label: string; value: string | number; icon: any; sub?: string;
  tint?: string; tone?: string;
}) {
  const iconColor = tone || colors.primary;
  return (
    <View style={styles.stat}>
      <View style={styles.statTop}>
        <View style={[styles.statIcon, tint ? { backgroundColor: tint } : null]}>
          <Icon name={icon} size={17} color={iconColor} />
        </View>
        <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      </View>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
      {!!sub && <Text style={styles.statSub} numberOfLines={1}>{sub}</Text>}
    </View>
  );
}

function MiniStat({ icon, value, label, tint, tone }: {
  icon: any; value: string | number; label: string; tint: string; tone: string;
}) {
  return (
    <View style={styles.miniStat}>
      <View style={[styles.miniStatIcon, { backgroundColor: tint }]}>
        <Icon name={icon} size={15} color={tone} />
      </View>
      <Text style={styles.miniStatValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.miniStatLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function ActivityRow({ item, now }: { item: any; now: Date }) {
  const meta = item.type === 'session'
    ? { icon: 'check' as const, tint: '#E7F8EF', tone: colors.success }
    : item.type === 'user'
      ? { icon: 'user' as const, tint: '#EAF0FF', tone: colors.primary }
      : { icon: 'flame' as const, tint: '#FFF1E4', tone: '#F2760E' };
  return (
    <View style={styles.activityRow}>
      <View style={[styles.activityIcon, { backgroundColor: meta.tint }]}>
        <Icon name={meta.icon} size={15} color={meta.tone} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.activityTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.activitySub} numberOfLines={1}>{item.sub}</Text>
      </View>
      <View style={styles.activityRight}>
        {!!item.value && <Text style={styles.activityValue}>{item.value}</Text>}
        <Text style={styles.activityTime}>{timeAgo(item.time, now)}</Text>
      </View>
    </View>
  );
}

function TrendBars({ trend }: { trend: any[] }) {
  const max = Math.max(1, ...trend.map((d) => Number(d.sessions) || 0));
  return (
    <View style={styles.trendRow}>
      {trend.map((d) => {
        const n = Number(d.sessions) || 0;
        return (
          <View key={d.day} style={styles.trendCol}>
            <Text style={styles.trendCount}>{n || ''}</Text>
            <View style={styles.trendTrack}>
              <View style={[styles.trendBar, { height: `${Math.max(6, (n / max) * 100)}%` }]} />
            </View>
            <Text style={styles.trendDay}>{dayLabel(d.day)}</Text>
          </View>
        );
      })}
    </View>
  );
}
function Meta({ label }: { label: string }) {
  return <View style={styles.meta}><Text style={styles.metaText}>{label}</Text></View>;
}
function Field({ label, value, onChange, keyboardType, secure, multiline }: {
  label: string; value: string; onChange: (v: string) => void;
  keyboardType?: 'numeric' | 'email-address' | 'phone-pad'; secure?: boolean; multiline?: boolean;
}) {
  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={[styles.input, multiline && styles.inputMultiline]} value={value} onChangeText={onChange}
        keyboardType={keyboardType} secureTextEntry={secure} multiline={multiline}
        autoCapitalize={keyboardType ? 'none' : undefined} autoCorrect={false}
        placeholderTextColor={colors.textMuted} />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: {
    marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.lg,
    shadowColor: '#004AFF', shadowOpacity: 0.28, shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }, elevation: 8,
  },
  adminPill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  adminPillText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  kicker: { ...typography.tiny, color: 'rgba(255,255,255,0.75)', fontWeight: '900', letterSpacing: 1.4 },
  title: { ...typography.h2, color: colors.white, marginTop: 6 },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 8, lineHeight: 17 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  tab: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { ...typography.caption, color: colors.textSecondary, fontWeight: '800' },
  tabTextActive: { color: colors.white },
  body: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: 110 },
  bottomNav: {
    flexDirection: 'row', backgroundColor: colors.white,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderTopColor: colors.divider,
    paddingTop: 9, paddingBottom: Platform.OS === 'ios' ? 18 : 8,
    shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 14,
    shadowOffset: { width: 0, height: -4 }, elevation: 10,
  },
  navItem: { flex: 1, alignItems: 'center', gap: 3 },
  navIcon: { width: 48, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  navIconActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary, shadowOpacity: 0.32, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  navText: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  navTextActive: { color: colors.primary },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: spacing.lg },
  stat: {
    width: '48%', backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md + 2, borderWidth: 1, borderColor: colors.border, ...shadows.card,
  },
  statTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statIcon: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: '#EAF0FF',
    alignItems: 'center', justifyContent: 'center',
  },
  statValue: { ...typography.h2, color: colors.text, fontWeight: '900' },
  statLabel: { ...typography.tiny, color: colors.textSecondary, marginTop: 10, fontWeight: '800' },
  card: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md + 2,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadows.card,
  },
  previewCard: {
    height: 176, borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing.md,
    backgroundColor: colors.primary, ...shadows.card,
  },
  previewImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  previewShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(6,16,44,0.55)' },
  previewTop: { flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md },
  previewLevel: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  previewLevelText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  previewPrice: { backgroundColor: '#FFC84A', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  previewPriceText: { color: '#6B4300', fontSize: 10, fontWeight: '900' },
  previewBottom: { position: 'absolute', left: spacing.md, bottom: spacing.md, right: 110 },
  previewTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  previewMeta: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 4 },
  previewAnim: { position: 'absolute', right: 6, bottom: 2 },
  totalsCard: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md + 2,
    borderWidth: 1, borderColor: colors.border, ...shadows.card,
  },
  totalsHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  totalsIcon: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: '#EAF0FF',
    alignItems: 'center', justifyContent: 'center',
  },
  totalsTitle: { ...typography.bodyBold, color: colors.text },
  totalsSub: { ...typography.tiny, color: colors.textSecondary, marginTop: 2 },
  totalsBadge: { backgroundColor: '#FFF0D6', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  totalsBadgeText: { color: '#B36A00', fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  totalsRow: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  totalTile: {
    flex: 1, minWidth: 0, alignItems: 'center', gap: 4,
    backgroundColor: colors.canvas, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 4,
  },
  totalTileIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  totalTileValue: { ...typography.h3, color: colors.text, fontWeight: '900' },
  totalTileLabel: { ...typography.tiny, color: colors.textSecondary },
  tabHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  tabHeadKicker: { ...typography.tiny, color: colors.primary, fontWeight: '900', letterSpacing: 1.4 },
  tabHeadTitle: { ...typography.h2, color: colors.text, marginTop: 4 },
  countPill: {
    minWidth: 36, height: 36, borderRadius: 18, backgroundColor: '#EAF0FF',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
  },
  countText: { color: colors.primary, fontSize: 14, fontWeight: '900' },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  stepBadge: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  stepText: { color: colors.white, fontSize: 11, fontWeight: '900' },
  stepTitle: { ...typography.bodyBold, color: colors.text },
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, ...shadows.card,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#EAF0FF',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarText: { color: colors.primary, fontSize: 18, fontWeight: '900' },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  proMini: { backgroundColor: '#FFF0D6', borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  proMiniText: { color: '#B36A00', fontSize: 9, fontWeight: '900' },
  planCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, ...shadows.card,
  },
  planIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#EAF0FF',
    alignItems: 'center', justifyContent: 'center',
  },
  planRight: { alignItems: 'flex-end', gap: 5 },
  levelPill: { backgroundColor: colors.canvas, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  levelPillText: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  editHint: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  actionFooter: { backgroundColor: colors.canvas, paddingHorizontal: spacing.lg, paddingTop: 6 },
  uploadWrap: {
    width: '100%', overflow: 'hidden',
    shadowColor: colors.primary, shadowOpacity: 0.25, shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  sectionTitle: { ...typography.h3, color: colors.text, marginBottom: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rowTitle: { ...typography.bodyBold, color: colors.text },
  rowSub: { ...typography.tiny, color: colors.textSecondary, marginTop: 3 },
  userMeta: { flexDirection: 'row', gap: 6, marginTop: 10 },
  meta: { backgroundColor: '#EAF0FF', borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  metaText: { fontSize: 10, fontWeight: '800', color: colors.primary },
  priceChip: { backgroundColor: '#FFF0D6', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  priceChipText: { fontSize: 11, fontWeight: '900', color: '#B36A00' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: 12, height: 46, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, color: colors.text, fontSize: 14 },
  searchResult: { ...typography.tiny, color: colors.primary, fontWeight: '800', marginBottom: 8 },
  empty: { ...typography.caption, color: colors.textMuted, textAlign: 'center', padding: 20 },
  fieldLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '800', marginTop: 12, marginBottom: 5 },
  input: { height: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, paddingHorizontal: 12, color: colors.text },
  inputMultiline: { height: 88, paddingTop: 10, textAlignVertical: 'top' },
  levelChip: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border },
  levelChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  exerciseList: { marginTop: 8, width: '100%' },
  exerciseItem: {
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: 8, overflow: 'hidden',
  },
  exerciseItemOn: { borderColor: colors.primary, backgroundColor: '#F7F9FF' },
  exerciseRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 10,
  },
  exerciseRowOn: { backgroundColor: 'transparent' },
  exerciseRowMain: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  exerciseToggle: {
    minWidth: 66, height: 30, borderRadius: 10, paddingHorizontal: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3,
    borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.white,
  },
  exerciseToggleOn: { borderColor: colors.danger, backgroundColor: '#FFE9E9' },
  exerciseToggleText: { color: colors.primary, fontSize: 10, fontWeight: '900' },
  exerciseToggleTextOn: { color: colors.danger },
  selectedRemove: {
    minWidth: 34, height: 28, borderRadius: 9, paddingHorizontal: 6,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFE9E9',
  },
  selectedRemoveText: { color: colors.danger, fontSize: 11, fontWeight: '900' },
  pressed: { opacity: 0.6 },

  exerciseName: { ...typography.caption, color: colors.text, flexShrink: 1 },
  animBadge: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  exLevel: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  animHint: { ...typography.tiny, color: colors.textMuted, marginTop: 8, lineHeight: 15 },
  exerciseSub: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  animActionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  animActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#EAF0FF', borderRadius: radius.md, paddingVertical: 10,
  },
  animActionText: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  animStrip: { flexDirection: 'row', gap: 8, paddingVertical: 10, width: '100%' },
  editorModal: {
    width: '100%', maxWidth: 460, height: '92%', maxHeight: 760,
    backgroundColor: colors.canvas, borderRadius: 22, overflow: 'hidden', ...shadows.card,
  },
  editorHead: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  editorSub: { ...typography.tiny, color: colors.textMuted, marginTop: 3 },
  editorScroll: { flex: 1 },
  editorContent: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    paddingBottom: spacing.xxl,
  },
  editorFooter: {
    backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.divider,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  animThumb: {
    width: 62, alignItems: 'center', gap: 2, paddingVertical: 6,
    backgroundColor: colors.canvas, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  animThumbOn: { backgroundColor: '#EAF0FF', borderColor: colors.primary },
  animThumbLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  animGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 },
  animGridItem: {
    width: 72, alignItems: 'center', gap: 2, paddingVertical: 8,
    backgroundColor: colors.canvas, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  modalPad: {
    flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg,
  },
  libraryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 10, marginBottom: 10,
    backgroundColor: colors.canvas, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.divider,
  },
  badgeOff: { backgroundColor: colors.canvas },
  libraryScroll: { flex: 1 },
  libraryAddBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 54, borderRadius: radius.pill, backgroundColor: colors.primary,
    marginTop: 10, ...shadows.button,
  },
  libraryAddText: { color: colors.white, fontSize: 13, fontWeight: '900', letterSpacing: 0.8 },
  libraryBadges: { flexDirection: 'row', gap: 6, marginTop: 1 },
  libraryGroupGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 2, paddingBottom: 10 },
  libraryGroupCard: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    minWidth: 92, maxWidth: 160, paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: radius.md, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border, ...shadows.card,
  },
  libraryGroupCardActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  libraryGroupCardText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  libraryGroupCardTextActive: { color: colors.white },
  libraryAddCompact: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, marginHorizontal: 6,
  },
  libraryDoneBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  libraryDoneText: { color: colors.white, fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  libraryActions: { gap: 6, alignItems: 'flex-end', flexShrink: 0 },
  libAddPill: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  libAddPillOn: { backgroundColor: '#FFE9E9' },
  libAddText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  libAddTextOn: { color: colors.danger },
  dupPill: { backgroundColor: '#FFF0D6', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  dupPillText: { color: '#B48600', fontSize: 9, fontWeight: '900' },
  selectedBox: {
    backgroundColor: colors.canvas, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.sm, marginBottom: 10,
  },
  selectedTitle: { ...typography.tiny, color: colors.primary, fontWeight: '900', letterSpacing: 0.6, marginBottom: 4 },
  selectedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.divider },
  selectedMeta: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
  soundMini: { backgroundColor: '#EAF0FF', borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  soundMiniText: { color: colors.primary, fontSize: 9, fontWeight: '900' },
  addAnimPill: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  addAnimText: { color: colors.white, fontSize: 9, fontWeight: '900', letterSpacing: 0.3 },
  libraryThumb: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  animMini: { backgroundColor: '#E7F8EF', borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 2 },
  animMiniText: { color: colors.success, fontSize: 9, fontWeight: '900' },
  libraryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12,
    backgroundColor: '#EAF0FF', borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 11,
  },
  libraryBtnText: { flex: 1, color: colors.primary, fontSize: 11, fontWeight: '800', lineHeight: 15 },
  exOrder: { color: colors.primary, fontSize: 10, fontWeight: '900' },
  builderItemRow: {
    flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 6,
    backgroundColor: '#EAF0FF', borderTopWidth: 1, borderTopColor: colors.border,
    paddingHorizontal: 10, paddingVertical: 9,
  },
  builderNum: { flex: 1, minWidth: 56 },
  builderNumLabel: { ...typography.tiny, color: colors.primary, fontWeight: '900' },
  builderNumInput: {
    height: 32, borderRadius: radius.sm, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 6,
    color: colors.text, fontSize: 12, marginTop: 3,
  },
  builderArrow: {
    width: 30, height: 32, borderRadius: radius.sm, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
  },
  builderArrowText: { color: colors.primary, fontSize: 15, fontWeight: '900' },
  uploadBtn: { flexDirection: 'row', height: 52, alignItems: 'center', justifyContent: 'center', gap: 8 },
  uploadText: { color: colors.white, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(10,16,32,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { width: '100%', maxWidth: 380, backgroundColor: colors.white, borderRadius: 20, padding: spacing.lg },
  modalBig: {
    width: '100%', maxWidth: 440, height: '88%', maxHeight: 760, backgroundColor: colors.canvas,
    borderRadius: 22, overflow: 'hidden', ...shadows.card,
  },
  detailHero: { padding: spacing.lg, paddingBottom: spacing.xl, alignItems: 'center', flexShrink: 0 },
  detailClose: { position: 'absolute', top: 12, right: 12, zIndex: 2, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  detailAvatar: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  detailAvatarImg: { width: 64, height: 64, borderRadius: 32 },
  detailAvatarText: { color: colors.white, fontSize: 26, fontWeight: '900' },
  detailName: { color: colors.white, fontSize: 20, fontWeight: '900', marginTop: 10 },
  detailEmail: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 3 },
  detailPro: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,200,74,0.2)', borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3, marginTop: 10 },
  detailProText: { color: '#FFC84A', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  detailLoading: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 7, backgroundColor: '#EAF0FF',
  },
  detailLoadingText: { ...typography.tiny, color: colors.primary, fontWeight: '800' },
  detailErrorBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    backgroundColor: '#FFE9E9', paddingHorizontal: spacing.md, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: '#FFD0D0', marginBottom: 8, borderRadius: radius.md,
  },
  detailErrorText: { flex: 1, ...typography.tiny, color: colors.danger, fontWeight: '800' },
  detailRetryBtn: {
    backgroundColor: colors.danger, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  detailRetryText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  detailScroll: { flex: 1, minHeight: 0 },
  detailBody: { padding: spacing.md, paddingBottom: spacing.xl },
  detailStatRow: { flexDirection: 'row', gap: 6, marginBottom: spacing.sm },
  detailStat: {
    flex: 1, minWidth: 0, alignItems: 'center', gap: 3,
    backgroundColor: colors.white, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 3,
    borderWidth: 1, borderColor: colors.border,
  },
  detailStatValue: { ...typography.h3, color: colors.text, fontWeight: '900' },
  detailStatLabel: { ...typography.tiny, color: colors.textSecondary },
  detailSection: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  detailSectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  detailSectionIcon: { width: 26, height: 26, borderRadius: 9, backgroundColor: '#EAF0FF', alignItems: 'center', justifyContent: 'center' },
  detailSectionTitle: { ...typography.caption, color: colors.text, fontWeight: '900' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  detailRowIcon: { width: 24, height: 24, borderRadius: 8, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  detailRowTitle: { ...typography.caption, color: colors.text, fontWeight: '800' },
  detailRowSub: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  detailRowRight: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  secondary: { flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.textSecondary, fontWeight: '800' },
  primary: { flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  modalPrimaryBtn: { width: '100%', height: 44, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  primaryText: { color: colors.white, fontWeight: '800' },
  toastBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: spacing.lg, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#E7F8EF', borderRadius: radius.md, borderWidth: 1, borderColor: '#BCEFD3',
  },
  toastBannerErr: { backgroundColor: '#FFE9E9', borderColor: '#FFD0D0' },
  toastTitle: { color: '#117A45', fontSize: 12, fontWeight: '900' },
  toastMsg: { ...typography.tiny, color: colors.textSecondary, marginTop: 1 },
  payHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addPayBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: 11, paddingVertical: 7,
  },
  addPayText: { color: colors.white, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  gatewayBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md,
    backgroundColor: '#FFF7DF', borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#FDE6A1',
  },
  gatewayBannerOk: { backgroundColor: '#E7F8EF', borderColor: '#BCEFD3' },
  gatewayTitle: { color: colors.text, fontSize: 12, fontWeight: '900' },
  gatewaySub: { ...typography.tiny, color: colors.textSecondary, marginTop: 2 },
  payMethodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 4 },
  grantProToggle: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 14, paddingVertical: 6 },
  grantProCheck: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center',
  },
  grantProCheckOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  grantProText: { flex: 1, ...typography.caption, color: colors.text, fontWeight: '700' },
  miniRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },

  // --- Admin control header ---
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.18)', borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#5CE6A0' },
  liveText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  controlRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  controlBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 40, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)',
  },
  controlBtnDanger: { backgroundColor: 'rgba(255,77,79,0.32)', borderColor: 'rgba(255,150,150,0.5)' },
  controlBtnText: { color: colors.white, fontSize: 11, fontWeight: '900', letterSpacing: 1 },

  // --- Dashboard ---
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.white, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 7,
  },
  refreshText: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  liveBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
    backgroundColor: '#E7F8EF', borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
  },
  liveBannerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  liveBannerText: { flex: 1, color: '#117A45', fontSize: 12, fontWeight: '800' },
  liveBannerMeta: { color: '#117A45', fontSize: 11, fontWeight: '900' },
  periodTabs: { flexDirection: 'row', gap: 8, paddingBottom: 10 },
  periodTab: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  periodTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodTabText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6, color: colors.textSecondary },
  periodTabTextActive: { color: colors.white },
  periodHint: { ...typography.tiny, color: colors.textMuted, marginBottom: 12 },
  statSub: { ...typography.tiny, color: colors.primary, marginTop: 6, fontWeight: '800' },
  miniCard: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md + 2,
    marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadows.card,
  },
  miniCardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  miniCardTitle: { flex: 1, ...typography.bodyBold, color: colors.text },
  miniCardBadge: { backgroundColor: '#E7F8EF', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  miniCardBadgeText: { color: colors.success, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  miniGrid: { flexDirection: 'row', gap: 8 },
  miniStat: {
    flex: 1, minWidth: 0, alignItems: 'center', gap: 4,
    backgroundColor: colors.canvas, borderRadius: radius.md, paddingVertical: 11, paddingHorizontal: 3,
  },
  miniStatIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  miniStatValue: { ...typography.h3, color: colors.text, fontWeight: '900' },
  miniStatLabel: { ...typography.tiny, color: colors.textSecondary },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  cardHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 },
  cardIcon: {
    width: 32, height: 32, borderRadius: 11, backgroundColor: '#EAF0FF',
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { ...typography.bodyBold, color: colors.text },
  cardSub: { ...typography.tiny, color: colors.textSecondary, marginTop: 2 },
  cardRight: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  trendRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 110 },
  trendCol: { flex: 1, alignItems: 'center', height: '100%' },
  trendCount: { color: colors.textSecondary, fontSize: 9, fontWeight: '900', height: 14 },
  trendTrack: {
    width: '100%', height: 70, borderRadius: radius.sm,
    backgroundColor: colors.canvas, justifyContent: 'flex-end', overflow: 'hidden',
  },
  trendBar: { width: '100%', backgroundColor: colors.primary, borderRadius: radius.sm },
  trendDay: { ...typography.tiny, color: colors.textMuted, marginTop: 6 },
  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.divider,
  },
  activityIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  activityTitle: { ...typography.caption, color: colors.text, fontWeight: '800' },
  activitySub: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  activityRight: { alignItems: 'flex-end' },
  activityValue: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  activityTime: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  rankRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 9, borderTopWidth: 1, borderTopColor: colors.divider,
  },
  rankBadge: {
    width: 26, height: 26, borderRadius: 9, backgroundColor: '#EAF0FF',
    alignItems: 'center', justifyContent: 'center',
  },
  rankBadgeFirst: { backgroundColor: '#FFF0D6' },
  rankText: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  totalsFoot: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 6,
    borderTopWidth: 1, borderTopColor: colors.divider, marginTop: spacing.md, paddingTop: 10,
  },
  totalsFootItem: { ...typography.tiny, color: colors.textSecondary, fontWeight: '800' },

  // --- Admin account ---
  accountSaveBtn: {
    height: 42, borderRadius: radius.pill, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', marginTop: 16,
  },
  accountSaveText: { color: colors.white, fontSize: 11, fontWeight: '900', letterSpacing: 1 },

  // --- Settings: gateway & support ---
  keyStatusRow: { flexDirection: 'row', gap: 8, marginTop: 2, marginBottom: 4 },
  keyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.canvas, borderRadius: radius.pill,
    paddingHorizontal: 9, paddingVertical: 5,
  },
  keyChipOn: { backgroundColor: '#E7F8EF' },
  keyChipText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  keyChipTextOn: { color: '#117A45' },

  // --- Users page ---
  filterTabs: { flexDirection: 'row', gap: 8, paddingTop: 2, paddingBottom: 10 },
  proShareTrack: {
    height: 6, borderRadius: 3, backgroundColor: colors.canvas,
    overflow: 'hidden', marginTop: 12,
  },
  proShareFill: { height: '100%', backgroundColor: colors.pro, borderRadius: 3 },
  proShareText: { ...typography.tiny, color: colors.textSecondary, marginTop: 6 },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  sortLabel: { ...typography.tiny, color: colors.textMuted, fontWeight: '900', letterSpacing: 0.8 },
  sortChip: {
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.pill,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  sortChipActive: { backgroundColor: '#EAF0FF', borderColor: colors.primary },
  sortChipText: { fontSize: 11, fontWeight: '800', color: colors.textSecondary },
  sortChipTextActive: { color: colors.primary },
  userRight: { alignItems: 'flex-end', gap: 6, alignSelf: 'center' },
  viewPill: { backgroundColor: '#EAF0FF', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  viewPillText: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  userProgressTrack: {
    height: 5, borderRadius: 3, backgroundColor: colors.divider,
    overflow: 'hidden', marginTop: 10,
  },
  userProgressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },
  userProgressHint: { ...typography.tiny, color: colors.primary, marginTop: 4, fontWeight: '800' },

  // --- Payments tab ---
  paySummaryGrid: { flexDirection: 'row', gap: 10, marginBottom: spacing.md },
  paySummaryGridSpacer: { width: 10 },
  paymentAvatar: {
    width: 40, height: 40, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  paymentCard: {
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, ...shadows.card,
  },
  paymentTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  paymentAmount: { alignItems: 'flex-end', gap: 5 },
  paymentAmountText: { color: colors.text, fontSize: 14, fontWeight: '900' },
  statusChip: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  statusChipText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  paymentMeta: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 8,
    borderTopWidth: 1, borderTopColor: colors.divider, marginTop: 10, paddingTop: 9,
  },
  paymentMetaText: { ...typography.tiny, color: colors.textSecondary },
  paymentIds: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8,
  },
  paymentIdText: { ...typography.tiny, color: colors.primary, fontWeight: '800' },
  modalHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
  },
  kvScroll: { maxHeight: 420, marginVertical: 8 },
  kvRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  kvLabel: { ...typography.tiny, color: colors.textMuted, fontWeight: '800', flexShrink: 1 },
  kvValue: { ...typography.caption, color: colors.text, fontWeight: '800', flexShrink: 2, textAlign: 'right' },

  // --- Home payment snapshot ---
  payHomeRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  payHomeTile: {
    flex: 1, minWidth: 0, alignItems: 'center',
    backgroundColor: colors.canvas, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 4,
  },
  payHomeValue: { color: colors.text, fontSize: 15, fontWeight: '900' },
  payHomeLabel: { ...typography.tiny, color: colors.textSecondary, marginTop: 3 },

  // ─── Improved Exercise Library Modal ────────────────────────────────────
  libHeader: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.md + 4, paddingBottom: spacing.md,
    borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden',
  },
  libHeaderTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  libHeaderKicker: { color: 'rgba(255,255,255,0.65)', fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  libHeaderTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', marginTop: 2 },
  libHeaderSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, lineHeight: 17 },
  libCountBubble: {
    alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, minWidth: 46,
  },
  libCountNum: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  libCountSub: { color: 'rgba(255,255,255,0.7)', fontSize: 9, fontWeight: '800', marginTop: 1 },
  libCloseBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  libSearchWrap: {
    paddingHorizontal: spacing.lg, paddingVertical: 10,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  libSearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.canvas, borderRadius: radius.md,
    paddingHorizontal: 12, height: 42,
    borderWidth: 1, borderColor: colors.border,
  },
  libListContent: { paddingBottom: 8 },
  libLoadingBox: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  libLoadingText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  libEmptyBox: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  libEmptyIcon: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: '#EAF0FF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  libEmptyTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 6 },
  libEmptySub: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  libExRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 11, paddingHorizontal: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  libExRowLast: { borderBottomWidth: 0 },
  libExThumb: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#EAF0FF', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  libExNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  libExName: { ...typography.caption, color: colors.text, fontWeight: '800', flexShrink: 1 },
  libExLevelPill: {
    backgroundColor: '#EAF0FF', borderRadius: radius.pill,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  libExLevelText: { color: colors.primary, fontSize: 10, fontWeight: '900' },
  libExMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  libExMusclePill: {
    backgroundColor: colors.canvas, borderRadius: radius.pill,
    paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: colors.border,
    maxWidth: 100,
  },
  libExMuscleText: { color: colors.textSecondary, fontSize: 9, fontWeight: '800' },
  libExAnimBadge: {
    backgroundColor: '#E7F8EF', borderRadius: radius.pill,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  libExAnimText: { color: colors.success, fontSize: 9, fontWeight: '900' },
  libExNoAnimBadge: {
    backgroundColor: '#FFF0D6', borderRadius: radius.pill,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  libExNoAnimText: { color: '#B48600', fontSize: 9, fontWeight: '900' },
  libExEditPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#EAF0FF', borderRadius: radius.pill,
    paddingHorizontal: 9, paddingVertical: 5,
  },
  libExEditText: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  libFooter: {
    backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.divider,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  libAddBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    height: 50, borderRadius: radius.pill, backgroundColor: colors.primary,
    shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  libAddIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  libAddBtnText: { color: colors.white, fontSize: 13, fontWeight: '900', letterSpacing: 0.8 },

  // ─── Exercises section (Step 3) ─────────────────────────────────────────
  exLibCta: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 14, marginBottom: 4,
    backgroundColor: '#EAF0FF', borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1.5, borderColor: colors.primary,
  },
  exLibCtaIcon: {
    width: 36, height: 36, borderRadius: 11, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  exLibCtaTitle: { color: colors.primary, fontSize: 13, fontWeight: '900' },
  exLibCtaSub: { color: colors.primary, fontSize: 11, marginTop: 2, opacity: 0.75 },
  exSearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.canvas, borderRadius: radius.md,
    paddingHorizontal: 12, height: 42, marginTop: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  exCountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 4 },
  exCountPill: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  exCountText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  exCountHint: { ...typography.tiny, color: colors.textSecondary, fontWeight: '800', flexShrink: 1 },
  exEmptyHint: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 2,
    backgroundColor: colors.canvas, borderRadius: radius.md, padding: 12,
    borderWidth: 1, borderColor: colors.divider,
  },
  exEmptyText: { flex: 1, ...typography.tiny, color: colors.textMuted, lineHeight: 16 },
  exOrderBox: {
    backgroundColor: '#F0F5FF', borderRadius: radius.md,
    borderWidth: 1, borderColor: '#C5D5FF', padding: 10, marginBottom: 10, marginTop: 4,
  },
  exOrderHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  exOrderTitle: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  exOrderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#D8E4FF',
  },
  exOrderNum: {
    width: 22, height: 22, borderRadius: 7, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  exOrderNumText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  exOrderTimePill: {
    backgroundColor: colors.white, borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.border,
  },
  exOrderTimeText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  exOrderRemove: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: '#FFE9E9', alignItems: 'center', justifyContent: 'center',
  },
  exCard: {
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: 8, overflow: 'hidden',
  },
  exCardOn: { borderColor: colors.primary, backgroundColor: '#F7F9FF' },
  exCardMain: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingTop: 10, paddingBottom: 10, paddingLeft: 10, paddingRight: 4,
  },
  exCardThumb: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#EAF0FF', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  exCardThumbOn: { backgroundColor: '#D6E8FF' },
  exLevelPill: {
    backgroundColor: '#EAF0FF', borderRadius: radius.pill,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  exLevelPillText: { color: colors.primary, fontSize: 9, fontWeight: '900' },
  exOrderBadge: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  exOrderBadgeText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  exCardActions: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingRight: 10, paddingBottom: 2,
    justifyContent: 'flex-end',
  },
  exAnimPill: {
    backgroundColor: '#FFF0D6', borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  exAnimPillText: { color: '#B48600', fontSize: 9, fontWeight: '900' },
  exToggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: radius.pill, backgroundColor: colors.primary,
  },
  exToggleBtnOn: { backgroundColor: '#FFE9E9' },
  exToggleText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  exToggleTextOn: { color: colors.danger },
  exTimingRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#EAF0FF', borderTopWidth: 1, borderTopColor: '#C5D5FF',
    paddingHorizontal: 10, paddingVertical: 10, gap: 0,
  },
  exTimingField: { flex: 1, alignItems: 'center' },
  exTimingLabel: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 0.5, marginBottom: 4 },
  exTimingInput: {
    width: '90%', height: 34, borderRadius: radius.sm,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 6, color: colors.text, fontSize: 13, fontWeight: '800',
    textAlign: 'center',
  },
  exTimingDivider: { width: 1, height: 36, backgroundColor: '#C5D5FF' },
  exReorderBtns: { flexDirection: 'column', gap: 4, paddingLeft: 8 },
  exReorderBtn: {
    width: 28, height: 24, borderRadius: 7, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  exReorderBtnText: { color: colors.primary, fontSize: 13, fontWeight: '900' },

  // ─── Audio gap scanner & preview styles ─────────────────────────────────
  audioGapCard: {
    borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, ...shadows.card,
  },
  audioGapCardOk: { backgroundColor: '#F6FCF8', borderColor: '#BBEAD0' },
  audioGapCardWarn: { backgroundColor: '#FFFBF0', borderColor: '#FFE09E' },
  audioGapTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  audioGapIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  audioGapTitle: { ...typography.caption, color: colors.text, fontWeight: '900' },
  audioGapSub: { ...typography.tiny, color: colors.textSecondary, marginTop: 2 },
  audioGapActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  audioGapBtnSecondary: {
    flex: 1, height: 36, borderRadius: radius.pill,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  audioGapBtnSecondaryText: { color: colors.textSecondary, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  audioGapBtnPrimary: {
    flex: 1.3, height: 36, borderRadius: radius.pill,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  audioGapBtnPrimaryText: { color: colors.white, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  planAudioChip: {
    backgroundColor: '#E7F8EF', borderRadius: radius.pill,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  planAudioChipGap: { backgroundColor: '#FFF0D6' },
  planAudioChipText: { color: colors.success, fontSize: 9, fontWeight: '900' },
  planAudioChipTextGap: { color: '#B48600' },
  libExAudioBadge: {
    backgroundColor: '#EAF0FF', borderRadius: radius.pill,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  libExAudioText: { color: colors.primary, fontSize: 9, fontWeight: '900' },
  libExNoAudioBadge: {
    backgroundColor: colors.canvas, borderRadius: radius.pill,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  libExNoAudioText: { color: colors.textMuted, fontSize: 9, fontWeight: '800' },
  previewAudioPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  previewAudioText: { color: colors.white, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
});
