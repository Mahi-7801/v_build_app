import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  authApi, clearApiCache, configApi, getLanguage, getToken, initClient, setLanguage, setToken, stringsApi, usersApi,
  subscriptionsApi,
} from '../api/client';
import type { Settings, User } from '../types';
import type { LevelKey } from '../data/workoutFilters';

export type WorkoutFilter = { category: string; level: LevelKey };

// Versioned so installing the 10-step onboarding always shows it first,
// even if an older build previously stored the 4-step onboarding flag.
const ONBOARD_KEY = '@homeworkout/onboarded_v2';
const PROFILE_KEY = '@homeworkout/profile';
const SETTINGS_KEY = '@homeworkout/settings';
const USER_KEY = '@homeworkout/user';

interface Profile {
  name?: string;
  gender?: 'male' | 'female' | 'other';
  goal?: string;
  difficulty?: number;
  weightKg?: number;
  heightCm?: number;
  age?: number;
  focusAreas?: string[];
  mainGoal?: string;
  motivation?: string;
  pushupLevel?: string;
  concerns?: string[];
  activityLevel?: string;
  weeklyDays?: number;
  firstDayOfWeek?: string;
}

/** PRO state comes from the server's subscription/expiry check, not a cached flag. */
async function applyProStatus(user: User | null): Promise<User | null> {
  if (!user) return user;
  try {
    const { data } = await subscriptionsApi.status();
    return { ...user, is_pro: data.isPro ? 1 : 0 };
  } catch {
    return user;
  }
}

/** Defaults so every toggle has a real value even for a guest account. */
export const DEFAULT_SETTINGS: Settings = {
  user_id: 0,
  gender: 'male',
  goal_type: 'stay_fit',
  difficulty: 1,
  units: 'metric',
  language: 'en',
  theme: 'light',
  voice_enabled: true,
  voice_rate: 100,
  sound_enabled: true,
  vibration_enabled: true,
  keep_screen_on: true,
  rest_multiplier: 1,
  auto_start_next: true,
  onboarding_complete: false,
};

interface AppState {
  ready: boolean;
  onboarded: boolean;
  user: User | null;
  /** True right after a manual sign-out, so the auth screen becomes the root. */
  signedOut: boolean;
  settings: Settings;
  lang: string;
  strings: Record<string, string>;
  /** Admin-editable reward settings, loaded from the server. */
  pointsTarget: number;
  proDiscountPercent: number;
  proPriceCents: number;
  /** Admin-editable support contact details shown in PRO / Help. */
  supportEmail: string;
  supportAddress: string;
  supportPhone: string;
  paymentCurrency: string;
  latestAppVersion: string;
  appUpdateUrl: string;
  profile: Profile;
  quote: string;
  catalogVersion: number;
  bumpCatalog: () => void;
  /** Filter shared between Home and Workouts so taps carry over between tabs. */
  workoutFilter: WorkoutFilter;
  setWorkoutFilter: (patch: Partial<WorkoutFilter>) => void;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Signs out to the login screen while keeping onboarding/profile intact. */
  signOut: () => Promise<void>;
  restartOnboarding: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  refreshConfig: () => Promise<void>;
  addPoints: (points: number) => void;
  finishOnboarding: (profile: Profile) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  changeLanguage: (lang: string) => Promise<void>;
  setQuote: (q: string) => void;
  t: (key: string, fallback?: string) => string;
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  onboarded: false,
  user: null,
  signedOut: false,
  settings: DEFAULT_SETTINGS,
  lang: 'en',
  strings: {},
  pointsTarget: 5000,
  proDiscountPercent: 40,
  proPriceCents: 2999,
  supportEmail: 'support@vbuild.app',
  supportAddress: '',
  supportPhone: '',
  paymentCurrency: 'INR',
  latestAppVersion: '',
  appUpdateUrl: '',
  profile: {},
  quote: 'The body achieves what the mind believes.',
  catalogVersion: 0,
  bumpCatalog: () => set((s) => ({ catalogVersion: s.catalogVersion + 1 })),
  workoutFilter: { category: '', level: 'all' },
  setWorkoutFilter: (patch) => set((s) => ({ workoutFilter: { ...s.workoutFilter, ...patch } })),

  init: async () => {
    await initClient();
    const [onboardedFlag, lang, profileRaw, settingsRaw, userRaw] = await Promise.all([
      AsyncStorage.getItem(ONBOARD_KEY),
      getLanguage(),
      AsyncStorage.getItem(PROFILE_KEY),
      AsyncStorage.getItem(SETTINGS_KEY),
      AsyncStorage.getItem(USER_KEY),
    ]);

    const token = getToken();
    let user: User | null = null;
    if (token && userRaw) {
      try { user = JSON.parse(userRaw); } catch { user = null; }
    }
    let settings: Settings = DEFAULT_SETTINGS;
    if (settingsRaw) {
      try { settings = { ...DEFAULT_SETTINGS, ...JSON.parse(settingsRaw) }; } catch { /* keep defaults */ }
    }
    let profile: Profile = {};
    if (profileRaw) {
      try { profile = JSON.parse(profileRaw); } catch { profile = {}; }
    }
    // Only a completed 10-step flow counts as onboarded. Any older or partial
    // state sends the user back to onboarding instead of straight to login.
    const onboarded = onboardedFlag === '1' && !!profile.focusAreas;

    // Set ready immediately from local storage so refresh never blocks or drops a session.
    set({
      ready: true,
      onboarded,
      lang,
      profile,
      user,
      settings,
    });

    if (token) {
      // Refresh user + PRO status in background; 401 is handled by client's unauthorizedHandler,
      // while transient offline/restart errors must NOT wipe the stored session token.
      usersApi.me()
        .then(async (me) => {
          if (get().signedOut || !getToken()) return;
          const freshUser = await applyProStatus(me.data.user);
          if (freshUser) {
            await AsyncStorage.setItem(USER_KEY, JSON.stringify(freshUser));
          }
          const patch: Partial<AppState> = { user: freshUser };
          if (me.data.settings) {
            const merged = { ...get().settings, ...me.data.settings };
            await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
            patch.settings = merged;
          }
          set(patch);
        })
        .catch(() => { /* keep cached session if offline / restarting */ });
    }

    // Admin-editable reward settings (points target / PRO discount).
    configApi.public()
      .then((res) => set({
        pointsTarget: Number(res.data?.pointsTarget) || 5000,
        proDiscountPercent: Number.isFinite(Number(res.data?.proDiscountPercent))
          ? Number(res.data.proDiscountPercent) : 40,
        proPriceCents: Number.isFinite(Number(res.data?.proPriceCents))
          ? Number(res.data.proPriceCents) : 2999,
        supportEmail: String(res.data?.supportEmail || 'support@vbuild.app'),
        supportAddress: String(res.data?.supportAddress || ''),
        supportPhone: String(res.data?.supportPhone || ''),
        paymentCurrency: String(res.data?.paymentCurrency || 'INR').toUpperCase(),
        latestAppVersion: String(res.data?.latestAppVersion || '').trim(),
        appUpdateUrl: String(res.data?.appUpdateUrl || '').trim(),
      }))
      .catch(() => {});

    // Non-blocking: localized strings arrive in the background so the first
    // screen can render immediately instead of waiting on this request.
    stringsApi.get(lang)
      .then((res) => set({ strings: res.data?.strings || {} }))
      .catch(() => {});
  },

  login: async (email, password) => {
    const { data } = await authApi.login(email, password);
    await setToken(data.token);
    const authedUser = await applyProStatus(data.user);
    if (authedUser) await AsyncStorage.setItem(USER_KEY, JSON.stringify(authedUser));
    set({ user: authedUser, signedOut: false });
    try {
      const me = await usersApi.me();
      if (me.data.settings) {
        const merged = { ...get().settings, ...me.data.settings };
        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
        set({ settings: merged });
      }
    } catch { /* non fatal */ }
  },

  register: async (email, password, name) => {
    const { data } = await authApi.register(email, password, name);
    await setToken(data.token);
    if (data.user) await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
    set({ user: data.user, signedOut: false });
  },

  logout: async () => {
    await setToken(null);
    await AsyncStorage.removeItem(USER_KEY);
    clearApiCache();
    set({ user: null });
  },

  signOut: async () => {
    await setToken(null);
    await AsyncStorage.removeItem(USER_KEY);
    clearApiCache();
    // Keep onboarding + profile so a returning user lands on a clean login
    // screen instead of being forced through all 10 questions again.
    set({ user: null, signedOut: true });
  },

  /** Sign-out returns the user to the 10-step onboarding, not to login. */
  restartOnboarding: async () => {
    await AsyncStorage.removeItem(ONBOARD_KEY);
    await AsyncStorage.removeItem(PROFILE_KEY);
    set({ onboarded: false, profile: {} });
  },

  refreshUser: async () => {
    if (!getToken()) return;
    try {
      clearApiCache();
      const me = await usersApi.me();
      const freshUser = await applyProStatus(me.data.user);
      if (freshUser) await AsyncStorage.setItem(USER_KEY, JSON.stringify(freshUser));
      set({ user: freshUser });
      if (me.data.settings) {
        const merged = { ...get().settings, ...me.data.settings };
        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
        set({ settings: merged });
      }
    } catch { /* ignore */ }
  },

  setUser: async (user) => {
    clearApiCache();
    if (user) await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    else await AsyncStorage.removeItem(USER_KEY);
    set({ user });
  },

  updateProfile: async (patch) => {
    const merged = { ...get().profile, ...patch };
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
    set({ profile: merged });
  },

  refreshConfig: async () => {
    try {
      const { data } = await configApi.public();
      set({
        pointsTarget: Number(data?.pointsTarget) || 5000,
        proDiscountPercent: Number.isFinite(Number(data?.proDiscountPercent))
          ? Number(data.proDiscountPercent) : 40,
        proPriceCents: Number.isFinite(Number(data?.proPriceCents))
          ? Number(data.proPriceCents) : 2999,
        supportEmail: String(data?.supportEmail || 'support@vbuild.app'),
        supportAddress: String(data?.supportAddress || ''),
        supportPhone: String(data?.supportPhone || ''),
        paymentCurrency: String(data?.paymentCurrency || 'INR').toUpperCase(),
        latestAppVersion: String(data?.latestAppVersion || '').trim(),
        appUpdateUrl: String(data?.appUpdateUrl || '').trim(),
      });
    } catch { /* keep current values */ }
  },

  /** Optimistically show earned fire points before the next server refresh. */
  addPoints: (points) => set((s) => {
    if (!s.user || !points) return s;
    const total = Number(s.user.points || 0) + points;
    const target = s.pointsTarget;
    return {
      user: {
        ...s.user,
        points: total,
        points_to_pro: Math.max(0, target - total),
        pro_discount_percent: total >= target ? s.proDiscountPercent : 0,
        pro_price_cents: total >= target
          ? Math.round(s.proPriceCents * (100 - s.proDiscountPercent) / 100)
          : s.proPriceCents,
      },
    };
  }),

  finishOnboarding: async (profile) => {
    const merged = { ...get().profile, ...profile };
    await AsyncStorage.setItem(ONBOARD_KEY, '1');
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
    set({ onboarded: true, profile: merged });
    await get().updateSettings({
      gender: merged.gender || 'other',
      goal_type: merged.goal || 'stay_fit',
      difficulty: merged.difficulty || 1,
      weight_kg: merged.weightKg || null,
      height_cm: merged.heightCm || null,
      age: merged.age || null,
      onboarding_complete: true,
    } as any);
  },

  /** Persists locally ALWAYS, and to MySQL as well when signed in. */
  updateSettings: async (patch) => {
    const merged = { ...get().settings, ...patch } as Settings;
    set({ settings: merged });
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    if (get().user) {
      try {
        const { data } = await usersApi.settings(patch);
        if (data.settings) {
          const synced = { ...merged, ...data.settings };
          set({ settings: synced });
          await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(synced));
        }
      } catch { /* local value still works */ }
    }
  },

  changeLanguage: async (lang) => {
    await setLanguage(lang);
    // Cached GET responses contain localized content — they are no longer valid.
    clearApiCache();
    let strings: Record<string, string> = {};
    try {
      strings = (await stringsApi.get(lang)).data.strings || {};
    } catch { /* keep previous strings */ }
    await get().updateSettings({ language: lang } as any);
    set({ lang, strings });
  },

  /** Translate a key using the APK's own localization table. */
  t: (key, fallback) => {
    const s = get().strings;
    return s[key] || fallback || key;
  },

  setQuote: (q) => set({ quote: q }),
}));
