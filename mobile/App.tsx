import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, StatusBar, AppState, Platform, TouchableOpacity, Text, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getInstalledAppVersion, isNewerVersion } from './src/version';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from './src/theme/colors';
import { radius, shadows, spacing } from './src/theme/theme';
import SplashScreen from './src/screens/SplashScreen';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAppStore } from './src/store/useAppStore';
import type { RootStackParamList } from './src/navigation/RootNavigator';
import {
  setupNotifications, syncReminders, notifyNow, checkDueReminders, getCachedReminders,
} from './src/notifications';
import { clearApiCache, configApi, getToken, remindersApi, setUnauthorizedHandler } from './src/api/client';
import { navigationRef, resetTo } from './src/navigation/navigationRef';
import { formatMoney } from './src/points';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { Icon } from './src/components/Icon';

/** Baseline of the last config the user saw — module scope survives re-renders. */
const SEEN_CATALOG_KEY = '@homeworkout/seen_catalog_rev';
const SEEN_CONFIG_KEY = '@homeworkout/seen_config_rev';
let seenRevision = '';
let seenConfig: any = null;
let seenCatalogRevision = '';

function describeConfigChange(prev: any, next: any) {
  if (!prev) return '';
  const changes: string[] = [];
  if (Number(prev.proPriceCents) !== Number(next.proPriceCents)) {
    changes.push(`PRO price is now ${formatMoney(Number(next.proPriceCents) / 100, next.paymentCurrency || 'INR')} / year`);
  }
  if (Number(prev.pointsTarget) !== Number(next.pointsTarget)) {
    changes.push(`Fire-points target is now ${next.pointsTarget}`);
  }
  if (Number(prev.discountPercent) !== Number(next.discountPercent)) {
    changes.push(`PRO reward discount is now ${next.discountPercent}%`);
  }
  if (prev.paymentCurrency !== next.paymentCurrency) {
    changes.push(`Currency is now ${next.paymentCurrency}`);
  }
  if (prev.supportEmail !== next.supportEmail
    || prev.supportAddress !== next.supportAddress
    || prev.supportPhone !== next.supportPhone) {
    changes.push('Support contact details were updated');
  }
  return changes.length ? changes.join('\n') : 'App settings were updated by the admin.';
}

type AdminAlertState = {
  title: string;
  body: string;
  isWorkout: boolean;
  planId?: number | null;
  planCode?: string | null;
};

export default function App() {
  const { ready, onboarded, user, init, refreshUser, refreshConfig, bumpCatalog, latestAppVersion, appUpdateUrl } = useAppStore();
  const [showSplash, setShowSplash] = useState(true);
  const [adminAlert, setAdminAlert] = useState<AdminAlertState | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const { version: installedVersion } = getInstalledAppVersion();
  const updateAvailable = !updateDismissed && !!appUpdateUrl && isNewerVersion(latestAppVersion, installedVersion);

  useEffect(() => {
    init().catch((err) => console.warn('[App] init error:', err));
    setupNotifications().catch((err) => console.warn('[App] setupNotifications error:', err));
  }, [init]);

  // An expired / rotated token must send both users and admins back to login.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      AsyncStorage.removeItem('@homeworkout/user').catch(() => { });
      useAppStore.setState({ user: null });
      if (useAppStore.getState().ready) resetTo('Auth');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // If the user resolves after initial mount (e.g. slow network restore), move straight to Home/Admin.
  useEffect(() => {
    if (!ready || !user || showSplash) return;
    if (!navigationRef.isReady()) return;
    const curr = navigationRef.getCurrentRoute()?.name;
    if (curr === 'Auth' || curr === 'Onboarding') {
      resetTo(user.is_admin ? 'Admin' : 'Main');
    }
  }, [ready, user, showSplash]);

  // Rebuild device alarms after login/app restart. Expo alarms can be lost
  // after an app update or reinstall, so the server list is the source of truth.
  const refreshReminders = useCallback(async () => {
    if (!getToken()) return;
    try {
      const { data } = await remindersApi.list();
      const list = data.reminders || [];
      await syncReminders(list);
    } catch { /* offline — keep existing device alarms */ }
  }, []);

  /**
   * Backend-driven delivery: the server compares its clock to each reminder's
   * saved time and day; when it reports a reminder due, show it here and tell
   * the server so it doesn't repeat today.
   */
  const pollDueReminders = useCallback(async () => {
    if (!getToken() || !useAppStore.getState().user) return;
    const localFired = await checkDueReminders(getCachedReminders());
    for (const id of localFired) {
      remindersApi.markNotified(id).catch(() => { });
    }
    try {
      const { data } = await remindersApi.due();
      for (const r of data.due || []) {
        if (localFired.includes(Number(r.id))) continue;
        const shown = await notifyNow(r.title || 'Workout reminder');
        if (shown) await remindersApi.markNotified(r.id);
      }
    } catch { /* offline — local device alarms and local minute check still work */ }
  }, []);

  useEffect(() => {
    if (user) refreshReminders();
  }, [user?.id, refreshReminders]);

  useEffect(() => {
    if (!user) return;
    pollDueReminders();
    const timer = setInterval(pollDueReminders, 20_000);
    return () => clearInterval(timer);
  }, [user?.id, pollDueReminders]);

  // Refresh account state (e.g. PRO activated on the server) and check due
  // reminders whenever the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshUser();
        refreshReminders();
        pollDueReminders();
      }
    });
    return () => sub.remove();
  }, [refreshUser, refreshReminders, pollDueReminders]);

  /**
   * Admin changes (new workouts, PRO price, points target, discount, support details) reach
   * every signed-in non-admin user immediately: poll the public config fingerprint + persisted
   * baseline and show an in-app alert banner + native notification on change.
   */
  const watchConfig = useCallback(async () => {
    const currentUser = useAppStore.getState().user;
    if (!currentUser || currentUser.is_admin) return;
    if (Platform.OS !== 'web' && AppState.currentState !== 'active') return;
    try {
      const { data } = await configApi.public();
      const revision = String(data?.revision || '');
      const catalog = String(data?.catalogRevision || '');

      if (!seenCatalogRevision) {
        const storedCat = await AsyncStorage.getItem(SEEN_CATALOG_KEY);
        if (storedCat) seenCatalogRevision = storedCat;
      }
      if (!seenRevision) {
        const storedCfg = await AsyncStorage.getItem(SEEN_CONFIG_KEY);
        if (storedCfg) seenRevision = storedCfg;
      }

      const firstCatalog = !seenCatalogRevision;
      const firstConfig = !seenRevision;
      if (firstCatalog && catalog) {
        seenCatalogRevision = catalog;
        await AsyncStorage.setItem(SEEN_CATALOG_KEY, catalog);
      }
      if (firstConfig && revision) {
        seenRevision = revision;
        seenConfig = data;
        await AsyncStorage.setItem(SEEN_CONFIG_KEY, revision);
      }
      if (firstCatalog && firstConfig) return;

      const settingsChanged = !firstConfig && !!seenRevision && !!revision && revision !== seenRevision;
      const workoutAdded = !firstCatalog && !!seenCatalogRevision && !!catalog && catalog !== seenCatalogRevision;
      if (!settingsChanged && !workoutAdded) return;

      const messages: string[] = [];
      if (workoutAdded) {
        const meta = [data?.latestWorkoutCategory, data?.latestWorkoutLevel ? `Level ${data.latestWorkoutLevel}` : '']
          .filter(Boolean)
          .join(' · ');
        const actionLabel = data?.latestWorkoutIsNew ? 'New workout added' : 'Workout updated';
        messages.push(`${actionLabel}: ${data?.latestWorkout || 'Check the Workouts page'}${meta ? ` (${meta})` : ''}`);
      }
      if (settingsChanged) messages.push(describeConfigChange(seenConfig, data));

      seenRevision = revision || seenRevision;
      seenConfig = data;
      seenCatalogRevision = catalog || seenCatalogRevision;
      if (catalog) await AsyncStorage.setItem(SEEN_CATALOG_KEY, catalog);
      if (revision) await AsyncStorage.setItem(SEEN_CONFIG_KEY, revision);

      if (workoutAdded) {
        clearApiCache();
        bumpCatalog();
      }
      await Promise.all([refreshConfig(), refreshUser()]);

      const title = workoutAdded && !settingsChanged
        ? (data?.latestWorkoutIsNew ? 'New workout available!' : 'Workout updated!')
        : 'App updated';
      const body = messages.filter(Boolean).join('\n');
      setAdminAlert({
        title,
        body,
        isWorkout: workoutAdded,
        planId: data?.latestWorkoutId || null,
        planCode: data?.latestWorkoutCode || null,
      });
      if (workoutAdded) {
        notifyNow(`${title} ${data?.latestWorkout || ''}`.trim()).catch(() => { });
      }
    } catch { /* offline — retry on the next tick */ }
  }, [refreshConfig, refreshUser, bumpCatalog]);

  useEffect(() => {
    watchConfig();
    const timer = setInterval(watchConfig, 5_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') watchConfig();
    });
    const onWebFocus = () => { watchConfig(); };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('focus', onWebFocus);
    }
    return () => {
      clearInterval(timer);
      subscription.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('focus', onWebFocus);
      }
    };
  }, [watchConfig, user?.id]);

  // Logged-in admins/users go straight to Admin/Main on refresh without being forced back to Onboarding/Splash.
  const route: keyof RootStackParamList = user?.is_admin
    ? 'Admin'
    : user
      ? 'Main'
      : !onboarded
        ? 'Onboarding'
        : 'Auth';
  const onSplash = !ready || (showSplash && !user);

  const openAlertWorkout = () => {
    const alert = adminAlert;
    setAdminAlert(null);
    if (!alert) return;
    if (navigationRef.isReady() && (alert.planId || alert.planCode)) {
      navigationRef.navigate('WorkoutDetail', {
        planId: alert.planId || undefined,
        planCode: alert.planCode || undefined,
      });
    }
  };

  return (
    <AppErrorBoundary>
      <GestureHandlerRootView style={[styles.root, onSplash && styles.rootSplash]}>
        <SafeAreaProvider>
          <StatusBar barStyle="dark-content" />
          {onSplash ? (
            <SplashScreen onDone={() => setShowSplash(false)} />
          ) : (
            <RootNavigator initialRoute={route} />
          )}
          {(!!adminAlert || updateAvailable) && !onSplash && (
            <View style={styles.alertOverlay} pointerEvents="box-none">
              {!!adminAlert && (
                <View style={styles.alertCard}>
                  <View style={styles.alertIcon}>
                    <Icon name={adminAlert.isWorkout ? 'dumbbell' : 'bell'} size={18} color={colors.white} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertTitle}>{adminAlert.title}</Text>
                    <Text style={styles.alertBody}>{adminAlert.body}</Text>
                    <View style={styles.alertActions}>
                      {adminAlert.isWorkout && (adminAlert.planId || adminAlert.planCode) && (
                        <TouchableOpacity onPress={openAlertWorkout} style={styles.alertPrimaryBtn}>
                          <Text style={styles.alertPrimaryText}>VIEW WORKOUT</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => setAdminAlert(null)} style={styles.alertCloseBtn}>
                        <Text style={styles.alertCloseText}>Dismiss</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
              {updateAvailable && (
                <View style={[styles.alertCard, !!adminAlert && { marginTop: 10 }]}>
                  <View style={styles.alertIcon}>
                    <Icon name="crown" size={18} color={colors.white} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertTitle}>Update app to v{latestAppVersion}</Text>
                    <Text style={styles.alertBody}>A new version is ready. Tap below to update over your existing app without losing your data.</Text>
                    <View style={styles.alertActions}>
                      <TouchableOpacity onPress={() => Linking.openURL(appUpdateUrl).catch(() => {})} style={styles.alertPrimaryBtn}>
                        <Text style={styles.alertPrimaryText}>UPDATE APP</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setUpdateDismissed(true)} style={styles.alertCloseBtn}>
                        <Text style={styles.alertCloseText}>Later</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  rootSplash: { backgroundColor: colors.canvas },
  alertOverlay: {
    position: 'absolute', top: Platform.OS === 'web' ? 16 : 48, left: 16, right: 16,
    alignItems: 'center', zIndex: 9999,
  },
  alertCard: {
    width: '100%', maxWidth: 440, flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: '#C8D8FF', ...shadows.card,
  },
  alertIcon: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  alertTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  alertBody: { color: colors.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 17 },
  alertActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  alertPrimaryBtn: {
    backgroundColor: colors.primary, borderRadius: radius.pill,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  alertPrimaryText: { color: colors.white, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  alertCloseBtn: {
    backgroundColor: colors.canvas, borderRadius: radius.pill,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  alertCloseText: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
});
