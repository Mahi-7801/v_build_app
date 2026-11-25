# Home Workout — No Equipment (React Native rebuild)

A full rebuild of `homeworkout.homeworkouts.noequipment` **v1.3.2 (build 98)** as a
React Native app with a Node.js/Express API backed by MySQL. The UI, plan data,
home-screen catalogue and 19-language strings were recovered by reverse
engineering the original APK with REA + JADX + Ghidra.

```
mobile/    React Native 0.76 app (TypeScript)
server/    Node.js 20+ Express API + MySQL schema + seed
analysis/  REA/JADX/Ghidra output, decoded assets, deobfuscated strings
```

---

## 1. Prerequisites

| Tool | Version used | Notes |
|---|---|---|
| Node.js | 24.x (18+ works) | `node -v` |
| MySQL | 8.4 or MariaDB 10.4+ | MySQL wire protocol; both work |
| JDK | 21 | Only needed to build the Android APK |
| Android SDK | API 35 + build-tools 35 | Only needed to build/run on Android |

The machine used for this build already had **MariaDB 10.4.32** running on
`127.0.0.1:3306` with `root/root`. MySQL 8.4.9 was additionally installed under
`C:\Program Files\MySQL\MySQL Server 8.4`.

---

## 2. Database + server

```powershell
cd server
npm.cmd install
cp .env.example .env          # edit DB credentials if needed
node scripts\migrate.js --fresh   # create/drop + recreate home_workout
node scripts\seed.js               # import the recovered APK data
node src\index.js                  # API on http://127.0.0.1:4000
```

Verify:

```powershell
curl http://127.0.0.1:4000/health
# {"status":"ok","db":true,...}
```

`npm.cmd run db:reset` does migrate + seed in one step.

### What the seed imports

| Table | Rows | Source |
|---|---:|---|
| `exercises` | 209 | action IDs + `attrs` (video, muscles, calories, level) |
| `exercise_texts` | 3,097 | exercise names + instructions in 19 languages |
| `exercise_tips` | 686 | real mistakeTips / breathTips |
| `workout_plans` | 136 | decrypted `workout/file/*`, `workout/diff/*`, `u/*`, `l/*`, `l0/*`, `l1/*`, `pro/*` |
| `workout_plan_items` | 14,798 | exercise + time + rest per plan |
| `explore_workouts` | 71 | `assets/explore_default/config` |
| `explore_modules` / `items` | 9 / 44 | home-screen carousels |
| `explore_lists` | 6 | curated collections |
| `app_strings` | 2,622 | 19-language UI strings + 190 in-app tips |
| `muscles` | 32 | `workout/muscle_major` + `muscle_minor` |
| `quotes` | 49 | **real** quotes from `assets/json/quotes` |
| `achievements` | 12 | derived from app flows |

### Demo account

```
email:    demo@homeworkout.app
password: workout123
```

---

## 3. React Native app

```powershell
cd mobile
npm.cmd install

# Terminal 1 — Metro
npm.cmd start

# Terminal 2 — device/emulator
npm.cmd android      # or: npm.cmd ios
```

For a **physical device**, change `API_BASE_URL` in `mobile/src/api/client.ts`
from `http://10.0.2.2:4000/api` to `http://<your-pc-LAN-IP>:4000/api`.

Type-check:

```powershell
cd mobile
npx.cmd tsc --noEmit
```

---

## 4. API surface

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | DB health probe |
| POST | `/api/auth/register`, `/login`, `/google` | Authentication (JWT) |
| GET | `/api/auth/me` | Current user |
| GET/PATCH | `/api/users/me` | Profile |
| GET/PUT | `/api/users/me/settings` | User preferences |
| GET | `/api/users/me/dashboard` | Home dashboard payload |
| GET | `/api/exercises`, `/:id`, `/meta/filters` | Exercise catalogue + localized text |
| GET | `/api/plans`, `/:id`, `/meta/categories` | Workout plans + items |
| GET | `/api/explore` | Home modules, workouts, lists (localized) |
| GET | `/api/explore/workouts/:id`, `/lists/:id` | Detail endpoints |
| GET | `/api/strings?lang=en`, `/languages` | 19-language UI strings |
| POST/GET | `/api/history/sessions`, `/sessions/:id/complete` | Workout session tracking |
| GET | `/api/history`, `/calendar`, `/:id` | History + calendar |
| GET/POST | `/api/progress/plans`, `/summary` | Plan progress + totals |
| GET/POST/PUT/DELETE | `/api/reminders` | Workout reminders |
| GET | `/api/quotes/random` | Motivational quotes |
| GET/POST | `/api/achievements`, `/mine`, `/recalculate` | Achievements |
| POST/GET/DELETE | `/api/subscriptions` | PRO subscription stub |
| POST/GET | `/api/health/sync` | Google Fit / Health Connect records |

All `/api/*` routes except auth, plans, exercises, explore and strings require
`Authorization: Bearer <token>`.

---

## 5. Screens implemented

| Screen | File | Notes |
|---|---|---|
| Splash | `SplashScreen.tsx` | Animated brand reveal |
| Onboarding | `OnboardingScreen.tsx` + `src/onboarding/*` | Gender → 8 question screens → Generating plan → Plan ready |
| Auth | `AuthScreen.tsx` | Mandatory login + registration after onboarding |
| Home | `HomeScreen.tsx` | Quote, stats, 9 explore carousels, PRO banner |
| Workouts | `WorkoutListScreen.tsx` | Search + 9 category chips + 136 plans |
| Workout detail | `WorkoutDetailScreen.tsx` | Metadata + exercise list + start |
| Exercise detail | `ExerciseDetailScreen.tsx` | Description, steps, coach tips |
| Explore list | `ExploreListScreen.tsx` | Curated collection |
| Player | `WorkoutPlayerScreen.tsx` | Countdown, exercise/rest timer, ring, skip, pause |
| Pause | (overlay in Player) | Equivalent to `PauseActivity` |
| Result | `ResultScreen.tsx` | Stats + share + achievement recompute |
| History | `HistoryScreen.tsx` | Totals, streak card, session list |
| Settings | `SettingsScreen.tsx` | Profile, 10 languages, workout prefs, sign-out |
| PRO | `ProScreen.tsx` | Premium feature list + activation stub |

App flow: **Splash ("Home Workout" name) → Gender (male/female image cards) →
8 onboarding steps (Focus Area, Main Goals, Motivation, Push-up Test, Body
Concerns, Activity Level, Weekly Goal, Body Metrics) → Generating Plan → Plan
Ready → Login / Sign-up (required) → Dashboard tabs: Home, Workout, Progress,
Settings.** The dashboard can't be opened or navigated back into without an
account; the first onboarding screen has a "LOG IN" shortcut for returning
users, and signing out resets the stack back to the 10-step onboarding.

The onboarding uses the shared design system in `mobile/src/onboarding/design.tsx`.
Its palette and artwork were recovered directly from Home Workout v1.8.2:
`guide_bg #F9F9FE`, `guide_text_black #0D0722`, `guide_text_gray #625A5C`,
gradient `#4B80ED → #1C34CF`. The 76 onboarding images (gender cut-outs,
Focus-Area body, scale/abs/fit goal thumbnails, motivation/level emoji icons,
plan artwork) were extracted from the v1.8.2 APK's `res/drawable-*` into
`mobile/assets/onboarding/real/` and are mapped in `src/onboarding/images.ts`.

Design tokens (from the original APK): `#004AFF` primary, `#0075FF→#004AFF`
gradient, `#1C212C` dark, `#F6F8FA` canvas, Outfit-style typography.

---

## 6. Known limitations

* Lottie animation files are decrypted but not bundled with the React Native
  app, so the player uses representative glyphs instead of the original
  animations. The real exercise names, descriptions, video URLs and tips are
  fully seeded.
* The original app's Facebook/Google login is stubbed as email/password plus a
  `/auth/google` endpoint that trusts a client-supplied verified token.
* Play Billing verification is a stub (activates PRO locally in the DB).
