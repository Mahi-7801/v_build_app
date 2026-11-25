import axios, { AxiosError, AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * API client for the Node.js + MySQL backend.
 *
 * The primary URL is this machine's current LAN IP. If it changes (DHCP),
 * update API_BASE_URL below. The app also retries the other known addresses
 * when a request cannot reach the server, so login keeps working.
 */
const PROD_URL = process.env.EXPO_PUBLIC_API_URL || 'https://your-api.example.com/api';

const BASES = __DEV__
  ? [
      process.env.EXPO_PUBLIC_API_URL || 'http://10.93.109.31:4000/api',
      'http://10.0.2.2:4000/api',        // Android emulator
    ]
  : [PROD_URL];

export const API_BASE_URL = BASES[0];

const TOKEN_KEY = '@homeworkout/token';
const LANG_KEY = '@homeworkout/lang';

const client: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  // Short timeout + fast fallback: when the phone cannot reach the LAN IP,
  // screens should show their local data immediately instead of hanging.
  timeout: 6000,
  headers: { 'Content-Type': 'application/json' },
});

let authToken: string | null = null;

export async function initClient(): Promise<void> {
  authToken = await AsyncStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  authToken = token;
  if (token) AsyncStorage.setItem(TOKEN_KEY, token);
  else AsyncStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return authToken;
}

/* In-memory GET cache: avoids a network round-trip when revisiting screens.
 * Keyed by URL + params + auth token so user data never leaks across accounts. */
const GET_CACHE_TTL = 60_000;
const getCache = new Map<string, { at: number; response: any }>();

function cacheKey(config: any): string {
  return `${config.baseURL || ''}|${config.url || ''}|${JSON.stringify(config.params || {})}|${authToken || 'guest'}|${config.lang || ''}`;
}

client.interceptors.request.use(async (config) => {
  if (!authToken) authToken = await AsyncStorage.getItem(TOKEN_KEY);
  if (authToken) config.headers.Authorization = `Bearer ${authToken}`;

  if (config.method === 'get' && !(config as any).force) {
    const hit = getCache.get(cacheKey(config));
    if (hit && Date.now() - hit.at < GET_CACHE_TTL) {
      // Returning a response from the request interceptor short-circuits axios.
      return { ...hit.response, config } as any;
    }
  }
  return config;
});

client.interceptors.response.use(
  (response) => {
    if (response.config.method === 'get' && response.status === 200) {
      getCache.set(cacheKey(response.config), { at: Date.now(), response });
    }
    return response;
  },
  async (error) => {
    const config = error.config as any;
    // Only retry when no HTTP response came back (network / timeout), and only
    // while there is another known address left to try.
    if (!config || error.response || (config as any).__noRetry) return Promise.reject(error);
    const idx = config.__baseIndex ?? 0;
    if (idx + 1 >= BASES.length) return Promise.reject(error);

    config.__baseIndex = idx + 1;
    config.baseURL = BASES[idx + 1];
    config.timeout = 3000; // retries must fail fast
    try {
      return await client.request(config);
    } catch (retryError) {
      return Promise.reject(retryError);
    }
  },
);

export function clearApiCache(): void {
  getCache.clear();
}

export function apiMessage(error: unknown): string {
  const e = error as AxiosError<{ message?: string; error?: string }>;
  return e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Something went wrong';
}

/* ----------------------------- endpoints -------------------------------- */

export const aiApi = {
  // The AI call can take longer than the global 15s timeout, and retrying it
  // would fire the same generation several times. Keep one request, longer wait.
  generate: (answers: Record<string, any>) =>
    client.post('/ai/plan', answers, { timeout: 45000, __noRetry: true } as any),
};

export const authApi = {
  register: (email: string, password: string, displayName?: string) =>
    client.post('/auth/register', { email, password, displayName }),
  login: (email: string, password: string) =>
    client.post('/auth/login', { email, password }),
  // Always fresh: PRO status can change while the app is running, and the
  // generic GET cache would otherwise keep returning the old `is_pro` value.
  me: () => client.get('/auth/me', { force: true } as any),
};

export const usersApi = {
  me: () => client.get('/users/me'),
  updateMe: (data: any) => client.patch('/users/me', data),
  settings: (data: any) => client.put('/users/me/settings', data),
  dashboard: () => client.get('/users/me/dashboard'),
};

export const exploreApi = {
  all: (lang = 'en') => client.get('/explore', { params: { lang } }),
  workout: (id: number, lang = 'en') => client.get(`/explore/workouts/${id}`, { params: { lang } }),
  list: (id: number, lang = 'en') => client.get(`/explore/lists/${id}`, { params: { lang } }),
};

export const plansApi = {
  list: (params: any = {}) => client.get('/plans', { params }),
  // Plan codes may contain "/" (e.g. "daily/d_ab_1") — encode so the detail
  // route receives one path segment instead of a 404.
  detail: (id: string | number) => client.get(`/plans/${encodeURIComponent(String(id))}`),
  categories: () => client.get('/plans/meta/categories'),
  start: (id: string | number) => client.post(`/progress/plans/${id}/start`),
  myPlans: () => client.get('/progress/plans'),
};

export const exercisesApi = {
  list: (params: any = {}) => client.get('/exercises', { params }),
  detail: (id: string | number, lang = 'en') => client.get(`/exercises/${id}`, { params: { lang } }),
  filters: () => client.get('/exercises/meta/filters'),
};

export const historyApi = {
  list: (params: any = {}) => client.get('/history', { params }),
  calendar: (from?: string, to?: string) => client.get('/history/calendar', { params: { from, to } }),
  detail: (id: number) => client.get(`/history/${id}`),
  startSession: (payload: any) => client.post('/history/sessions', payload),
  logExercise: (sessionId: number, payload: any) =>
    client.post(`/history/sessions/${sessionId}/exercises`, payload),
  completeSession: (sessionId: number, payload: any) =>
    client.post(`/history/sessions/${sessionId}/complete`, payload),
};

export const quotesApi = {
  random: (lang = 'en') => client.get('/quotes/random', { params: { lang } }),
};

export const stringsApi = {
  get: (lang = 'en') => client.get('/strings', { params: { lang } }),
  languages: () => client.get('/strings/languages'),
};

export const achievementsApi = {
  mine: () => client.get('/achievements/mine'),
  recalculate: () => client.post('/achievements/recalculate'),
};

/** Weight / health records used by the Report tab's weight chart and BMI card. */
export const healthApi = {
  list: (from?: string, to?: string) => client.get('/health', { params: { from, to } }),
  sync: (records: Array<{ date: string; weightKg?: number | null; calories?: number | null; steps?: number | null }>, source = 'manual') =>
    client.post('/health/sync', { records, source }),
};

export const remindersApi = {
  // Fresh list required: after create/delete the cached copy would still show
  // the old reminders and keep deleted alarms scheduled on the device.
  list: () => client.get('/reminders', { force: true } as any),
  /** Backend decides which reminders are due right now. */
  due: () => client.get('/reminders/due', { force: true } as any),
  markNotified: (id: number) => client.post(`/reminders/${id}/notify`, {}),
  create: (payload: any) => client.post('/reminders', payload),
  update: (id: number, patch: any) => client.put(`/reminders/${id}`, patch),
  remove: (id: number) => client.delete(`/reminders/${id}`),
};

export const configApi = {
  // Always fresh: admin can change the points target while the app is open.
  public: () => client.get('/config/public', { force: true } as any),
};

export const adminApi = {
  settings: () => client.get('/admin/settings'),
  updateSettings: (patch: any) => client.patch('/admin/settings', patch),
  overview: () => client.get('/admin/overview'),
  users: (q = '') => client.get('/admin/users', { params: { q } }),
  user: (id: number | string) => client.get(`/admin/users/${id}`),
  plans: () => client.get('/admin/plans'),
  exercises: (level = 0, q = '') => client.get('/admin/exercises', { params: { level, q } }),
  updatePlan: (id: number, patch: any) => client.patch(`/admin/plans/${id}`, patch),
  createPlan: (payload: any) => client.post('/admin/plans', payload),
};

export const subscriptionsApi = {
  status: () => client.get('/subscriptions/status', { force: true } as any),
  verify: (payload: { productId: string; receipt?: string; platform?: string; discountPercent?: number }) =>
    client.post('/subscriptions/verify', payload),
  list: () => client.get('/subscriptions'),
};

export async function getLanguage(): Promise<string> {
  return (await AsyncStorage.getItem(LANG_KEY)) || 'en';
}

export async function setLanguage(lang: string): Promise<void> {
  await AsyncStorage.setItem(LANG_KEY, lang);
}

export default client;
