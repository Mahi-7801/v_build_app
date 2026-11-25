import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, StatusBar, AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from './src/theme/colors';
import SplashScreen from './src/screens/SplashScreen';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAppStore } from './src/store/useAppStore';
import type { RootStackParamList } from './src/navigation/RootNavigator';
import { setupNotifications, syncReminders, notifyNow } from './src/notifications';
import { remindersApi } from './src/api/client';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';

export default function App() {
  const { onboarded, user, init, refreshUser } = useAppStore();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    init();
    setupNotifications();
  }, [init]);

  // Rebuild device alarms after login/app restart. Expo alarms can be lost
  // after an app update or reinstall, so the server list is the source of truth.
  const refreshReminders = useCallback(async () => {
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
    if (!useAppStore.getState().user) return;
    try {
      const { data } = await remindersApi.due();
      for (const r of data.due || []) {
        const shown = await notifyNow(r.title || 'Workout reminder');
        if (shown) await remindersApi.markNotified(r.id);
      }
    } catch { /* offline — try again on the next tick */ }
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

  const route: keyof RootStackParamList = !onboarded ? 'Onboarding' : !user ? 'Auth' : 'Main';
  // Splash is time-based only. Waiting for `ready` can trap the user on the
  // splash when the API is unreachable (Expo Go on another Wi-Fi, offline).
  const onSplash = showSplash;

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
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  rootSplash: { backgroundColor: colors.canvas },
});
