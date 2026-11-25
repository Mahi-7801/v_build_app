import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, RefreshControl, Platform, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { colors } from '../theme/colors';
import { radius, spacing, typography, shadows } from '../theme/theme';
import { Icon } from '../components/Icon';
import { adminApi } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { resetTo } from '../navigation/navigationRef';
import { formatPoints } from '../points';
import * as Speech from 'expo-speech';
import { GradientBox } from '../onboarding/design';
import { ExerciseArt } from '../components/ExerciseArt';
import { COVERS } from '../onboarding/coverImages';

type Tab = 'overview' | 'users' | 'plans' | 'upload' | 'settings';
// Same navigation shape as the user app, but admin content behind each button.
const TABS: Array<{ key: Tab; label: string; icon: any }> = [
  { key: 'overview', label: 'Home', icon: 'home' },
  { key: 'plans', label: 'Workouts', icon: 'dumbbell' },
  { key: 'users', label: 'Progress', icon: 'award' },
  { key: 'upload', label: 'Upload', icon: 'plus' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];
const CATEGORIES = ['abs', 'chest', 'arms', 'legs', 'shoulder', 'hiit', 'stretch', 'full_body', 'back', 'core', 'other'];

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
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState(false);
  const [overview, setOverview] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [exercises, setExercises] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [exerciseQuery, setExerciseQuery] = useState('');
  const [planQuery, setPlanQuery] = useState('');
  const [planLevel, setPlanLevel] = useState<'all' | '1' | '2' | '3'>('all');
  const [detail, setDetail] = useState<any>(null);
  const [userOpen, setUserOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [form, setForm] = useState({
    name: '', code: '', category: 'abs', level: 1, durationSec: 420,
    priceCents: 0, lottieUrl: '', exerciseIds: [] as number[],
  });
  const [settingsForm, setSettingsForm] = useState({
    pointsTarget: '5000', discountPercent: '40', proPriceCents: '2999',
  });

  const load = useCallback(async () => {
    setBusy(true);
    try {
      if (tab === 'overview') {
        const r = await adminApi.overview();
        setOverview(r.data);
      } else if (tab === 'users') {
        const r = await adminApi.users(query);
        setUsers(r.data.users || []);
      } else if (tab === 'plans') {
        const r = await adminApi.plans();
        setPlans(r.data.plans || []);
      } else if (tab === 'upload') {
        // Show exercises matching the workout level + search typed by admin.
        const r = await adminApi.exercises(form.level, exerciseQuery);
        setExercises(r.data.exercises || []);
      } else {
        const r = await adminApi.settings();
        setSettingsForm({
          pointsTarget: String(r.data.settings?.pointsTarget ?? 5000),
          discountPercent: String(r.data.settings?.discountPercent ?? 40),
          proPriceCents: String(r.data.settings?.proPriceCents ?? 2999),
        });
      }
    } catch { /* keep previous state */ }
    finally { setBusy(false); }
  }, [tab, query, form.level, exerciseQuery]);

  useEffect(() => { load(); }, [load]);

  const openUser = async (id: number) => {
    setBusy(true);
    try {
      const r = await adminApi.user(id);
      setDetail(r.data);
      setUserOpen(true);
    } catch { /* ignore */ }
    finally { setBusy(false); }
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
    } catch { /* ignore */ }
    finally { setBusy(false); }
  };

  const uploadPlan = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await adminApi.createPlan({
        name: form.name.trim(), code: form.code.trim() || undefined,
        category: form.category, level: form.level,
        durationSec: form.durationSec, priceCents: form.priceCents,
        lottieUrl: form.lottieUrl.trim() || undefined,
        exerciseIds: form.exerciseIds,
      });
      setForm({ name: '', code: '', category: 'abs', level: 1, durationSec: 420, priceCents: 0, lottieUrl: '', exerciseIds: [] });
      setTab('plans');
      notify('Workout added', 'Your new workout is now live for all users.', 'New workout added successfully');
    } catch { /* ignore */ }
    finally { setBusy(false); }
  };

  const saveSettings = async () => {
    setBusy(true);
    try {
      await adminApi.updateSettings({
        pointsTarget: Math.max(1, Number(settingsForm.pointsTarget) || 5000),
        discountPercent: Math.min(100, Math.max(0, Number(settingsForm.discountPercent) || 0)),
        proPriceCents: Math.max(0, Number(settingsForm.proPriceCents) || 0),
      });
      await refreshConfig();
      notify('Settings saved', 'Points target and PRO rewards updated for all users.', 'Settings saved successfully');
    } catch { /* ignore */ }
    finally { setBusy(false); }
  };

  /** App-wide confirmation: alert + spoken notification sound. */
  const notify = (title: string, message: string, spoken: string) => {
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
  const previewActionId = previewExercise?.action_id || 15;
  const cover = COVERS[Math.max(0, CATEGORIES.indexOf(form.category)) % COVERS.length];

  const leave = async () => { await signOut(); resetTo('Auth'); };

  return (
    <SafeAreaView style={styles.root}>
      <GradientBox radius={22} colors={['#0B1E4D', '#004AFF']} style={styles.header}>
        <View style={styles.adminPill}>
          <Icon name="crown" size={11} color="#FFC84A" />
          <Text style={styles.adminPillText}>ADMIN CONTROL</Text>
        </View>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>CONTROL CENTER</Text>
            <Text style={styles.title}>Admin panel</Text>
            <Text style={styles.headerSub}>Manage workouts, users and rewards</Text>
          </View>
          <TouchableOpacity onPress={load} style={styles.iconBtn}>
            <Icon name="settings" size={20} color={colors.white} />
          </TouchableOpacity>
          <TouchableOpacity onPress={leave} style={styles.iconBtn}>
            <Icon name="logout" size={20} color={colors.white} />
          </TouchableOpacity>
        </View>
      </GradientBox>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={colors.primary} />}
      >
        {tab === 'overview' && (
          <>
            <View style={styles.statGrid}>
              <AdminStat label="Users" value={overview?.users ?? 0} icon="user" />
              <AdminStat label="Workouts" value={overview?.plans ?? 0} icon="dumbbell" />
              <AdminStat label="Sessions" value={overview?.sessions ?? 0} icon="check" />
              <AdminStat label="Fire points" value={formatPoints(overview?.totalPoints || 0)} icon="flame" />
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
              <View style={styles.countPill}><Text style={styles.countText}>{users.length}</Text></View>
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
            {!!query && <Text style={styles.searchResult}>Found {users.length} user{users.length === 1 ? '' : 's'} for “{query}”</Text>}
            {users.map((u) => (
              <TouchableOpacity key={u.id} style={styles.userCard} onPress={() => openUser(u.id)}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(u.display_name || u.email || 'U').charAt(0).toUpperCase()}</Text>
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
                  </View>
                </View>
                <Icon name="chevron" size={17} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
            {!users.length && <Text style={styles.empty}>No users found.</Text>}
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
              <TouchableOpacity key={p.id} style={styles.planCard} onPress={() => {
                setEditPlan(p); setEditName(p.name); setEditPrice(String(Math.round((p.price_cents || 0) / 100)));
              }}>
                <View style={styles.planIcon}><Icon name="dumbbell" size={18} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>{p.code} · {p.category}</Text>
                  <Text style={styles.rowSub}>{p.total_exercises} exercises · {Math.round((p.duration_sec || 0) / 60)} min</Text>
                </View>
                <View style={styles.planRight}>
                  <View style={styles.levelPill}><Text style={styles.levelPillText}>L{p.level}</Text></View>
                  <View style={styles.priceChip}>
                    <Text style={styles.priceChipText}>{p.price_cents ? `$${(p.price_cents / 100).toFixed(2)}` : 'FREE'}</Text>
                  </View>
                  <Text style={styles.editHint}>EDIT</Text>
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
                <Text style={styles.tabHeadKicker}>CREATE CONTENT</Text>
                <Text style={styles.tabHeadTitle}>Upload a workout</Text>
              </View>
              <View style={styles.countPill}><Text style={styles.countText}>{form.exerciseIds.length}</Text></View>
            </View>

            <View style={styles.previewCard}>
              <Image source={cover} resizeMode="cover" style={styles.previewImage} />
              <View style={styles.previewShade} />
              <View style={styles.previewTop}>
                <View style={styles.previewLevel}>
                  <Text style={styles.previewLevelText}>{['', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'][form.level]}</Text>
                </View>
                <View style={styles.previewPrice}>
                  <Text style={styles.previewPriceText}>{form.priceCents ? `$${(form.priceCents / 100).toFixed(2)}` : 'FREE'}</Text>
                </View>
              </View>
              <View style={styles.previewBottom}>
                <Text style={styles.previewTitle} numberOfLines={2}>{form.name.trim() || 'New workout name'}</Text>
                <Text style={styles.previewMeta}>{form.durationSec} min · {form.exerciseIds.length} exercises · {form.category}</Text>
              </View>
              <View style={styles.previewAnim} pointerEvents="none">
                <ExerciseArt actionId={previewActionId} size={88} glyph="◆" />
              </View>
            </View>

            <View style={styles.card}>
              <StepHeader step="1" title="Workout details" icon="dumbbell" />
              <Field label="Workout name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Field label="Code (optional)" value={form.code} onChange={(v) => setForm({ ...form, code: v })} />
              <Text style={styles.fieldLabel}>Category</Text>
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
              <Field label="Price (USD, 0 = free)" value={String(form.priceCents / 100)} keyboardType="numeric"
                onChange={(v) => setForm({ ...form, priceCents: Math.round((Number(v) || 0) * 100) })} />
              <Field label="Animation URL (Lottie JSON, optional)" value={form.lottieUrl}
                onChange={(v) => setForm({ ...form, lottieUrl: v })} />
            </View>

            <View style={styles.card}>
              <StepHeader step="3" title="Exercises & animations" icon="flame" />
              <Text style={styles.animHint}>
                Showing {['', 'Beginner', 'Intermediate', 'Advanced'][form.level]} exercises. ▶ = has animation (e.g. pull-ups).
              </Text>
              <View style={styles.searchRow}>
                <Icon name="search" size={16} color={colors.textMuted} />
                <TextInput style={styles.search} placeholder="Search exercises"
                  placeholderTextColor={colors.textMuted} value={exerciseQuery}
                  onChangeText={setExerciseQuery} returnKeyType="search" clearButtonMode="while-editing" />
                {!!exerciseQuery && (
                  <TouchableOpacity onPress={() => setExerciseQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Icon name="close" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.exerciseList}>
                {exercises.slice(0, 120).map((e) => {
                  const on = form.exerciseIds.includes(e.id);
                  return (
                    <TouchableOpacity key={e.id} style={[styles.exerciseRow, on && styles.exerciseRowOn]} onPress={() => setForm({
                      ...form,
                      exerciseIds: on ? form.exerciseIds.filter((x) => x !== e.id) : [...form.exerciseIds, e.id],
                    })}>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {!!e.has_animation && <Text style={styles.animBadge}>▶</Text>}
                        <Text style={styles.exerciseName} numberOfLines={1}>{e.name}</Text>
                        <Text style={styles.exLevel}>L{e.level}</Text>
                      </View>
                      <Icon name={on ? 'check' : 'plus'} size={17} color={on ? colors.primary : colors.textMuted} />
                    </TouchableOpacity>
                  );
                })}
              </View>
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
              <Field label="PRO price (USD)" value={(Number(settingsForm.proPriceCents) / 100).toFixed(2)}
                keyboardType="numeric" onChange={(v) => setSettingsForm({ ...settingsForm, proPriceCents: String(Math.round((Number(v) || 0) * 100)) })} />
            </View>

          </>
        )}
      </ScrollView>

      {/* Sticky action button — never overlaps the form or bottom nav */}
      {(tab === 'upload' || tab === 'settings') && (
        <View style={styles.actionFooter}>
          <GradientBox radius={22} style={styles.uploadWrap} colors={['#0075FF', '#004AFF']}>
            <TouchableOpacity
              onPress={tab === 'upload' ? uploadPlan : saveSettings}
              disabled={busy || (tab === 'upload' && !form.name.trim())}
              style={styles.uploadBtn}
            >
              {busy ? <ActivityIndicator color={colors.white} /> : (
                <>
                  <Icon name={tab === 'upload' ? 'plus' : 'check'} size={18} color={colors.white} />
                  <Text style={styles.uploadText}>{tab === 'upload' ? 'UPLOAD WORKOUT' : 'SAVE SETTINGS'}</Text>
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
            <Field label="Price (USD)" value={editPrice} keyboardType="numeric" onChange={setEditPrice} />
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
                <Text style={styles.detailAvatarText}>
                  {(detail?.user?.display_name || detail?.user?.email || 'U').charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.detailName} numberOfLines={1}>{detail?.user?.display_name || 'User'}</Text>
              <Text style={styles.detailEmail} numberOfLines={1}>{detail?.user?.email}</Text>
              {!!detail?.user?.is_pro && (
                <View style={styles.detailPro}><Icon name="crown" size={11} color="#FFC84A" /><Text style={styles.detailProText}>PRO MEMBER</Text></View>
              )}
            </GradientBox>

            <ScrollView style={styles.detailBody}>
              <View style={styles.detailStatRow}>
                <DetailStat icon="check" value={detail?.progress?.sessions ?? 0} label="Workouts" />
                <DetailStat icon="clock" value={detail?.progress?.minutes ?? 0} label="Minutes" />
                <DetailStat icon="flame" value={detail?.progress?.calories ?? 0} label="kcal" />
                <DetailStat icon="trophy" value={formatPoints(detail?.user?.points || 0)} label="Points" />
              </View>

              <DetailSection icon="dumbbell" title="Workout history">
                {(detail?.workouts || []).map((w: any) => (
                  <DetailRow key={w.id} icon="check" title={w.title}
                    sub={`${Math.round((w.duration_sec || 0) / 60)} min · ${w.status}`} right={`${w.exercises_done || 0} ex`} />
                ))}
                {!detail?.workouts?.length && <Text style={styles.empty}>No workouts yet.</Text>}
              </DetailSection>

              <DetailSection icon="target" title="Active plans">
                {(detail?.plans || []).map((p: any) => (
                  <DetailRow key={p.id} icon="play" title={p.name}
                    sub={`${p.category || 'workout'} · L${p.level || 1}`} right={`Day ${p.current_day || 0}`} />
                ))}
                {!detail?.plans?.length && <Text style={styles.empty}>No active plans.</Text>}
              </DetailSection>

              <DetailSection icon="flame" title="Point history">
                {(detail?.pointsLedger || []).slice(0, 15).map((l: any) => (
                  <DetailRow key={l.id} icon="flame" title={l.reason}
                    sub={new Date(l.created_at).toLocaleDateString()} right={`+${l.points}`} />
                ))}
                {!detail?.pointsLedger?.length && <Text style={styles.empty}>No points earned yet.</Text>}
              </DetailSection>
            </ScrollView>
          </View>
        </View>
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

function AdminStat({ label, value, icon }: { label: string; value: string | number; icon: any }) {
  return (
    <View style={styles.stat}>
      <View style={styles.statTop}>
        <View style={styles.statIcon}><Icon name={icon} size={17} color={colors.primary} /></View>
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}
function Meta({ label }: { label: string }) {
  return <View style={styles.meta}><Text style={styles.metaText}>{label}</Text></View>;
}
function Field({ label, value, onChange, keyboardType }: {
  label: string; value: string; onChange: (v: string) => void; keyboardType?: 'numeric';
}) {
  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.input} value={value} onChangeText={onChange}
        keyboardType={keyboardType} placeholderTextColor={colors.textMuted} />
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
    alignItems: 'center', justifyContent: 'center',
  },
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
  levelChip: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: radius.sm, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border },
  levelChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  exerciseList: { maxHeight: 260, marginTop: 6 },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 4, borderRadius: radius.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  exerciseRowOn: { backgroundColor: '#EAF0FF' },
  exerciseName: { ...typography.caption, color: colors.text, flexShrink: 1 },
  animBadge: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  exLevel: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  animHint: { ...typography.tiny, color: colors.textMuted, marginTop: 8, lineHeight: 15 },
  uploadBtn: { flexDirection: 'row', height: 52, alignItems: 'center', justifyContent: 'center', gap: 8 },
  uploadText: { color: colors.white, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(10,16,32,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { width: '100%', maxWidth: 380, backgroundColor: colors.white, borderRadius: 20, padding: spacing.lg },
  modalBig: {
    width: '100%', maxWidth: 420, maxHeight: '88%', backgroundColor: colors.canvas,
    borderRadius: 22, overflow: 'hidden', ...shadows.card,
  },
  detailHero: { padding: spacing.lg, paddingBottom: spacing.xl, alignItems: 'center' },
  detailClose: { position: 'absolute', top: 12, right: 12, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  detailAvatar: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  detailAvatarText: { color: colors.white, fontSize: 26, fontWeight: '900' },
  detailName: { color: colors.white, fontSize: 20, fontWeight: '900', marginTop: 10 },
  detailEmail: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 3 },
  detailPro: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,200,74,0.2)', borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3, marginTop: 10 },
  detailProText: { color: '#FFC84A', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  detailBody: { padding: spacing.md },
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
  primaryText: { color: colors.white, fontWeight: '800' },
  miniRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
});
