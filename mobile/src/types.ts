export interface User {
  id: number | string;
  email?: string | null;
  display_name: string;
  avatar_url?: string | null;
  phone?: string | null;
  auth_provider?: string;
  is_pro?: boolean | number;
  is_admin?: boolean;
  pro_expires_at?: string | null;
  points?: number;
  points_to_pro?: number;
  pro_discount_percent?: number;
  pro_price_cents?: number;
}

export interface Settings {
  user_id: number | string;
  weight_kg?: string | number | null;
  height_cm?: number | null;
  age?: number | null;
  gender?: string;
  goal_type?: string;
  goal_weight_kg?: string | number | null;
  difficulty?: number;
  units?: string;
  language?: string;
  theme?: string;
  voice_enabled?: number | boolean;
  sound_enabled?: number | boolean;
  vibration_enabled?: number | boolean;
  keep_screen_on?: number | boolean;
  rest_multiplier?: string | number;
  auto_start_next?: number | boolean;
  onboarding_complete?: number | boolean;
  [key: string]: any;
}

export interface ExploreWorkout {
  id: number;
  name: string;
  description: string;
  nameKey: string;
  descriptionKey: string;
  durationSec: number;
  minutes: number;
  muscles: number[];
  icon: string | null;
  iconBg: any;
  cover: string | null;
  partId: number | null;
  categoryId: number | null;
  gender: number | null;
  lock: string | null;
  level: number | null;
  levelLabel: string;
  listIds: number[];
  planCode: string | null;
  firstActionId?: number | null;
}

export interface WorkoutPlan {
  id: number;
  code: string;
  name: string;
  description: string | null;
  category: string;
  level: number;
  duration_sec: number;
  total_exercises: number;
  rounds: number;
  cover_image: string | null;
  is_pro: number | boolean;
  price_cents?: number;
  lottie_url?: string | null;
  first_action_id?: number | null;
}

export interface PlanItem {
  id: number;
  sequence: number;
  action_id: number;
  time_sec: number;
  rest_sec: number;
  rounds: number;
  day_id: number | null;
  exercise_id: number | null;
  name: string | null;
  slug: string | null;
  unit: string | null;
  image_path: string | null;
  lottie_path: string | null;
  alternation?: number;
  speed?: number;
  wm_speed?: number;
  calories_per_unit?: string | number;
  is_pro?: number | boolean;
}

export interface PlanDetail {
  plan: WorkoutPlan;
  days: Array<{ id: number; day_index: number; name: string }>;
  items: PlanItem[];
}

export interface Exercise {
  id: number;
  action_id: number;
  slug: string;
  name: string;
  introduce: string | null;
  unit: string;
  image_path: string | null;
  lottie_path: string | null;
  alternation: number;
  speed: number;
  wm_speed: number;
  primary_muscle: string | null;
  secondary_muscles: string[];
  equipment: string;
  level: number;
  calories_per_unit: string | number;
  is_pro: number | boolean;
  title?: string;
  description?: string;
  steps?: any;
  coach_tips?: any;
}

export interface Quote {
  id: number;
  text: string;
  author: string | null;
}

export interface Dashboard {
  totals: { sessions: number; total_seconds: number; total_calories: number };
  activePlans: any[];
  recentSessions: any[];
}

export interface HistorySession {
  id: number;
  plan_id: number | null;
  title: string;
  started_at: string;
  completed_at: string | null;
  duration_sec: number;
  total_calories: string | number;
  total_reps: number;
  exercises_done: number;
  exercises_total: number;
  status: string;
}
