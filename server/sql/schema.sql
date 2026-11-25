-- =====================================================================
-- Home Workout - No Equipment  (React Native rebuild)
-- MySQL 8 schema
-- Derived from REA/JADX analysis of
-- homeworkout-homeworkouts-noequipment-98 v1.3.2 (package
-- homeworkout.homeworkouts.noequipment, versionCode 98, targetSdk 33)
-- =====================================================================

CREATE DATABASE IF NOT EXISTS home_workout
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE home_workout;

-- ---------------------------------------------------------------------
-- Users & accounts
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email           VARCHAR(190)     NULL,
  password_hash   VARCHAR(255)     NULL,
  display_name    VARCHAR(120)     NOT NULL DEFAULT 'User',
  avatar_url      VARCHAR(512)     NULL,
  phone           VARCHAR(40)      NULL,
  -- 'local' | 'google' | 'facebook'
  auth_provider   ENUM('local','google','facebook') NOT NULL DEFAULT 'local',
  google_id       VARCHAR(190)     NULL,
  facebook_id     VARCHAR(190)     NULL,
  country_code    CHAR(2)          NULL,
  is_pro          TINYINT(1)       NOT NULL DEFAULT 0,
  pro_expires_at  DATETIME         NULL,
  points          INT              NOT NULL DEFAULT 0,
  created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_google (google_id),
  UNIQUE KEY uq_users_facebook (facebook_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Admin-editable runtime settings (points target, PRO discount/price).
CREATE TABLE IF NOT EXISTS app_config (
  config_key   VARCHAR(60)  NOT NULL,
  value        VARCHAR(255) NOT NULL,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO app_config (config_key, value) VALUES
  ('points_target', '5000'),
  ('pro_discount_percent', '40'),
  ('pro_price_cents', '2999');

-- Fire points earned for completed workouts and the 5,000-point PRO discount.
CREATE TABLE IF NOT EXISTS points_ledger (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  points      INT             NOT NULL,
  reason      VARCHAR(60)     NOT NULL,
  ref_id      BIGINT UNSIGNED NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_points_ledger_user (user_id, created_at),
  CONSTRAINT fk_points_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mirrors the original app's SharedPreferences/Kotpref profile state.
CREATE TABLE IF NOT EXISTS user_settings (
  user_id             BIGINT UNSIGNED NOT NULL,
  -- body metrics
  weight_kg           DECIMAL(5,2)   NULL,
  height_cm           SMALLINT       NULL,
  age                 TINYINT        NULL,
  gender              ENUM('male','female','other') NOT NULL DEFAULT 'other',
  -- goal
  goal_type           ENUM('lose_weight','build_muscle','stay_fit','other') NOT NULL DEFAULT 'stay_fit',
  goal_weight_kg      DECIMAL(5,2)   NULL,
  difficulty           TINYINT        NOT NULL DEFAULT 1,
  -- preferences
  units               ENUM('metric','imperial') NOT NULL DEFAULT 'metric',
  language            VARCHAR(10)    NOT NULL DEFAULT 'en',
  theme               ENUM('light','dark','system') NOT NULL DEFAULT 'light',
  voice_enabled       TINYINT(1)     NOT NULL DEFAULT 1,
  voice_rate          SMALLINT       NOT NULL DEFAULT 100,
  sound_enabled       TINYINT(1)     NOT NULL DEFAULT 1,
  vibration_enabled   TINYINT(1)     NOT NULL DEFAULT 1,
  keep_screen_on      TINYINT(1)     NOT NULL DEFAULT 1,
  rest_multiplier     DECIMAL(3,2)   NOT NULL DEFAULT 1.00,
  auto_start_next     TINYINT(1)     NOT NULL DEFAULT 1,
  countdown_sound     VARCHAR(64)    NOT NULL DEFAULT 'beep',
  -- integrations
  google_fit_enabled  TINYINT(1)     NOT NULL DEFAULT 0,
  health_connect_on   TINYINT(1)     NOT NULL DEFAULT 0,
  onboarding_complete TINYINT(1)     NOT NULL DEFAULT 0,
  updated_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Exercise catalogue  (original assets: assets/workout/actions/<id>/...)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercises (
  id                INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  action_id         INT             NOT NULL,          -- original "actionId" in plan JSON
  slug              VARCHAR(190)    NOT NULL,
  name              VARCHAR(190)    NOT NULL,
  introduce         TEXT            NULL,
  unit              ENUM('s','reps','km') NOT NULL DEFAULT 's',
  image_path        VARCHAR(512)    NULL,
  lottie_path       VARCHAR(512)    NULL,
  video_url         VARCHAR(512)    NULL,
  -- original ExerciseVo: alternation / speed / wmSpeed
  alternation       TINYINT(1)      NOT NULL DEFAULT 0,
  speed             INT             NOT NULL DEFAULT 1,
  wm_speed          INT             NOT NULL DEFAULT 1,
  primary_muscle    VARCHAR(64)     NULL,
  secondary_muscles JSON            NULL,
  equipment         ENUM('none','bench','dumbbell','band','towel') NOT NULL DEFAULT 'none',
  level             TINYINT         NOT NULL DEFAULT 1,
  calories_per_unit DECIMAL(6,3)    NOT NULL DEFAULT 0,
  is_pro            TINYINT(1)      NOT NULL DEFAULT 0,
  sort_order        INT             NOT NULL DEFAULT 0,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exercises_action (action_id),
  KEY idx_exercises_muscle (primary_muscle),
  KEY idx_exercises_level (level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Localised copy (original assets/workout/actions/<id>/text/<n>/data/<lang>)
CREATE TABLE IF NOT EXISTS exercise_texts (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  exercise_id  INT UNSIGNED    NOT NULL,
  lang         VARCHAR(10)     NOT NULL,
  title        VARCHAR(255)    NOT NULL,
  description  TEXT            NULL,
  steps        JSON            NULL,
  -- original ExerciseVo.coachTips -> [{tip,title}]
  coach_tips   JSON            NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_exercise_text (exercise_id, lang),
  CONSTRAINT fk_extext_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Original exercise_ext_info_<lang>.json  (mistakeTips / breathTips)
CREATE TABLE IF NOT EXISTS exercise_tips (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  exercise_id  INT UNSIGNED    NULL,      -- NULL = global tip
  lang         VARCHAR(10)     NOT NULL,
  tip_type     ENUM('mistake','breath','general') NOT NULL DEFAULT 'general',
  title        VARCHAR(255)    NULL,
  content      TEXT            NOT NULL,
  sort_order   INT             NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_tips_exercise (exercise_id),
  CONSTRAINT fk_tips_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Workout plans  (original assets/workout/file/<code>.json)
--   JSON shape: [{"name":"1","exercise":[{"actionId":15,"time":20,"rest":10}, ...]}]
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workout_plans (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code           VARCHAR(120) NOT NULL,       -- original file name, e.g. "d_ab_1"
  name           VARCHAR(190) NOT NULL,
  description    TEXT         NULL,
  category       ENUM('abs','hiit','chest','legs','shoulder','stretch','full_body','arms','back','core','pelvic','other') NOT NULL DEFAULT 'other',
  level          TINYINT      NOT NULL DEFAULT 1,
  duration_sec   INT          NOT NULL DEFAULT 0,
  total_exercises INT         NOT NULL DEFAULT 0,
  rounds         INT          NOT NULL DEFAULT 1,
  cover_image    VARCHAR(512) NULL,
  price_cents    INT          NOT NULL DEFAULT 0,
  lottie_url     VARCHAR(512) NULL,
  is_pro         TINYINT(1)   NOT NULL DEFAULT 0,
  sort_order     INT          NOT NULL DEFAULT 0,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plans_code (code),
  KEY idx_plans_category (category),
  KEY idx_plans_level (level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workout_plan_days (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  plan_id     INT UNSIGNED NOT NULL,
  day_index   INT          NOT NULL,
  name        VARCHAR(190) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plan_day (plan_id, day_index),
  CONSTRAINT fk_days_plan FOREIGN KEY (plan_id) REFERENCES workout_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workout_plan_items (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  plan_id     INT UNSIGNED NOT NULL,
  day_id      INT UNSIGNED NULL,
  sequence    INT          NOT NULL,
  action_id   INT          NOT NULL,
  exercise_id INT UNSIGNED NULL,
  time_sec    INT          NOT NULL DEFAULT 30,
  rest_sec    INT          NOT NULL DEFAULT 15,
  rounds      INT          NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_items_plan (plan_id, sequence),
  CONSTRAINT fk_items_plan  FOREIGN KEY (plan_id)  REFERENCES workout_plans(id)  ON DELETE CASCADE,
  CONSTRAINT fk_items_day   FOREIGN KEY (day_id)   REFERENCES workout_plan_days(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_ex    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Progress & history
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_plans (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           BIGINT UNSIGNED NOT NULL,
  plan_id           INT UNSIGNED    NOT NULL,
  current_day       INT             NOT NULL DEFAULT 1,
  completed_days    INT             NOT NULL DEFAULT 0,
  total_workouts    INT             NOT NULL DEFAULT 0,
  started_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_workout_at   DATETIME        NULL,
  completed_at      DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_plan (user_id, plan_id),
  CONSTRAINT fk_userplans_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_userplans_plan FOREIGN KEY (plan_id) REFERENCES workout_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workout_sessions (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           BIGINT UNSIGNED NOT NULL,
  plan_id           INT UNSIGNED    NULL,
  plan_day_id       INT UNSIGNED    NULL,
  title             VARCHAR(190)    NOT NULL,
  started_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at      DATETIME        NULL,
  duration_sec      INT             NOT NULL DEFAULT 0,
  planned_duration_sec INT          NOT NULL DEFAULT 0,
  total_calories    DECIMAL(7,2)    NOT NULL DEFAULT 0,
  total_reps        INT             NOT NULL DEFAULT 0,
  exercises_done    INT             NOT NULL DEFAULT 0,
  exercises_total   INT             NOT NULL DEFAULT 0,
  status            ENUM('active','completed','abandoned') NOT NULL DEFAULT 'active',
  PRIMARY KEY (id),
  KEY idx_sessions_user (user_id, started_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sessions_plan FOREIGN KEY (plan_id) REFERENCES workout_plans(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workout_session_exercises (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id       BIGINT UNSIGNED NOT NULL,
  exercise_id      INT UNSIGNED    NULL,
  sequence         INT             NOT NULL,
  planned_sec      INT             NOT NULL DEFAULT 0,
  actual_sec       INT             NOT NULL DEFAULT 0,
  reps             INT             NOT NULL DEFAULT 0,
  calories         DECIMAL(7,2)    NOT NULL DEFAULT 0,
  skipped          TINYINT(1)      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_sessex_session (session_id, sequence),
  CONSTRAINT fk_sessex_session  FOREIGN KEY (session_id)  REFERENCES workout_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_sessex_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_exercise_stats (
  user_id           BIGINT UNSIGNED NOT NULL,
  exercise_id       INT UNSIGNED    NOT NULL,
  times_completed   INT             NOT NULL DEFAULT 0,
  total_sec         INT             NOT NULL DEFAULT 0,
  total_reps        INT             NOT NULL DEFAULT 0,
  last_completed_at DATETIME        NULL,
  PRIMARY KEY (user_id, exercise_id),
  CONSTRAINT fk_stats_user    FOREIGN KEY (user_id)    REFERENCES users(id)       ON DELETE CASCADE,
  CONSTRAINT fk_stats_exercise FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Reminders (ReminderJobService / ExactAlarmReceiver / Receiver)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reminders (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NOT NULL,
  title        VARCHAR(190)    NOT NULL DEFAULT 'Workout reminder',
  time_of_day  TIME            NOT NULL,
  days_of_week JSON            NOT NULL,          -- [1,2,3,4,5,6,7] ISO
  enabled      TINYINT(1)      NOT NULL DEFAULT 1,
  reminder_type ENUM('daily','weekday','custom','snooze') NOT NULL DEFAULT 'daily',
  last_notified_at DATETIME     NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reminders_user (user_id, enabled),
  CONSTRAINT fk_reminders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Misc content
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotes (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  text        VARCHAR(512) NOT NULL,
  author      VARCHAR(190) NULL,
  lang        VARCHAR(10)  NOT NULL DEFAULT 'en',
  PRIMARY KEY (id),
  KEY idx_quotes_lang (lang)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS achievements (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(64)  NOT NULL,
  title       VARCHAR(190) NOT NULL,
  description VARCHAR(512) NULL,
  icon        VARCHAR(190) NULL,
  metric      ENUM('sessions','minutes','streak','exercises','calories') NOT NULL DEFAULT 'sessions',
  threshold   INT          NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_achievement_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id        BIGINT UNSIGNED NOT NULL,
  achievement_id INT UNSIGNED    NOT NULL,
  progress       INT             NOT NULL DEFAULT 0,
  unlocked_at    DATETIME        NULL,
  PRIMARY KEY (user_id, achievement_id),
  CONSTRAINT fk_ua_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ua_ach  FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscriptions (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  product_id    VARCHAR(190)    NOT NULL,      -- Play Billing SKU
  platform      ENUM('google_play','app_store','manual') NOT NULL DEFAULT 'google_play',
  receipt       TEXT            NULL,
  active        TINYINT(1)      NOT NULL DEFAULT 0,
  purchased_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at    DATETIME        NULL,
  PRIMARY KEY (id),
  KEY idx_sub_user (user_id, active),
  CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Google Fit / Health Connect synced metrics
CREATE TABLE IF NOT EXISTS health_records (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  record_date DATE            NOT NULL,
  weight_kg   DECIMAL(5,2)    NULL,
  calories    DECIMAL(8,2)    NULL,
  steps       INT             NULL,
  source      ENUM('google_fit','health_connect','manual') NOT NULL DEFAULT 'manual',
  updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_health_user_date (user_id, record_date),
  CONSTRAINT fk_health_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Server-side view: daily totals for the history calendar screen
CREATE OR REPLACE VIEW v_user_daily_activity AS
SELECT
  s.user_id,
  DATE(s.started_at)   AS activity_date,
  COUNT(*)             AS sessions,
  SUM(s.duration_sec)  AS total_seconds,
  SUM(s.total_calories) AS total_calories
FROM workout_sessions s
WHERE s.status = 'completed'
GROUP BY s.user_id, DATE(s.started_at);

-- =====================================================================
-- Explore catalogue
-- Recovered from assets/explore_default/config (REA-decoded) + the
-- 19 language files under assets/explore_default/strings/<lang>.
-- =====================================================================

-- Muscle taxonomy (assets/workout/muscle_major + muscle_minor)
CREATE TABLE IF NOT EXISTS muscles (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_value   VARCHAR(64) NOT NULL,       -- "abs", "quadriceps", ...
  name_key     VARCHAR(64) NOT NULL,       -- i18n key
  scope        ENUM('major','minor') NOT NULL DEFAULT 'major',
  sort_order   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_muscle (scope, item_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Localised UI copy (assets/explore_default/strings/<lang>)
CREATE TABLE IF NOT EXISTS app_strings (
  id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lang     VARCHAR(10)    NOT NULL,
  str_key  VARCHAR(190)   NOT NULL,
  value    TEXT           NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_string (lang, str_key),
  KEY idx_app_strings_lang (lang)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The 71 "explore" workouts shown on the home screen
CREATE TABLE IF NOT EXISTS explore_workouts (
  id               INT UNSIGNED NOT NULL,
  name_key         VARCHAR(190) NOT NULL,
  description_key  VARCHAR(190) NULL,
  duration_sec     INT         NOT NULL DEFAULT 0,
  minutes          INT         NOT NULL DEFAULT 0,
  muscles          JSON        NULL,
  icon             VARCHAR(190) NULL,
  icon_bg          JSON        NULL,
  cover            VARCHAR(190) NULL,
  part_id          INT         NULL,
  category_id      INT         NULL,
  gender           INT         NULL,
  lock_state       VARCHAR(16) NULL,      -- "1_0" free, "1_1" pro, "0_0" n/a
  level_key        VARCHAR(64) NULL,
  level            TINYINT     NULL,
  workoutlist_ids  JSON        NULL,
  recommended_ids  JSON        NULL,
  plan_code        VARCHAR(190) NULL,     -- resolved assets/workout/file/<code>.json
  sort_order       INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_explore_plan (plan_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Curated collections ("butt_leg", "six_pack", ...)
CREATE TABLE IF NOT EXISTS explore_lists (
  id              INT UNSIGNED NOT NULL,
  name_key        VARCHAR(190) NOT NULL,
  description_key VARCHAR(190) NULL,
  cover           VARCHAR(190) NULL,
  icon            VARCHAR(190) NULL,
  workout_ids     JSON         NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Home-screen carousels
CREATE TABLE IF NOT EXISTS explore_modules (
  id              INT UNSIGNED NOT NULL,
  name_key        VARCHAR(190) NOT NULL,
  description_key VARCHAR(190) NULL,
  sort_order      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS explore_module_items (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  module_id   INT UNSIGNED    NOT NULL,
  workout_id  INT UNSIGNED    NOT NULL,
  name_key    VARCHAR(190)    NULL,
  icon        VARCHAR(190)    NULL,
  sort_order  INT             NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_module_items_module (module_id, sort_order),
  CONSTRAINT fk_module_items_module FOREIGN KEY (module_id) REFERENCES explore_modules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
