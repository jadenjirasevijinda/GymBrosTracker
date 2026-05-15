-- ==========================================
-- IRON LOG - Complete Supabase Schema
-- ==========================================
-- Run this SQL in your Supabase SQL Editor (Database -> SQL Editor)
-- DO NOT run these one at a time - paste the entire script

-- ==========================================
-- 1. CREATE TABLES
-- ==========================================

-- Members table
CREATE TABLE IF NOT EXISTS public.members (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_uid TEXT UNIQUE,
  name TEXT NOT NULL,
  tag TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exercises library
CREATE TABLE IF NOT EXISTS public.exercises (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_uid TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'other' CHECK (category IN ('warmup', 'chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'cardio', 'other')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workout plans (template/planned workouts)
CREATE TABLE IF NOT EXISTS public.workout_plans (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_uid TEXT UNIQUE,
  date DATE NOT NULL,
  name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exercises in a plan
CREATE TABLE IF NOT EXISTS public.plan_exercises (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES public.workout_plans(id) ON DELETE CASCADE,
  exercise_id BIGINT NOT NULL REFERENCES public.exercises(id) ON DELETE RESTRICT,
  target_sets INT,
  target_reps TEXT,
  target_weight TEXT,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Logged workouts (actual sessions)
CREATE TABLE IF NOT EXISTS public.workout_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_uid TEXT UNIQUE,
  date DATE NOT NULL,
  name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Members present at a workout
CREATE TABLE IF NOT EXISTS public.log_members (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  log_id BIGINT NOT NULL REFERENCES public.workout_logs(id) ON DELETE CASCADE,
  member_id BIGINT NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(log_id, member_id)
);

-- Exercises performed in a logged workout
CREATE TABLE IF NOT EXISTS public.log_exercises (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  log_id BIGINT NOT NULL REFERENCES public.workout_logs(id) ON DELETE CASCADE,
  exercise_id BIGINT NOT NULL REFERENCES public.exercises(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Individual sets for each exercise in a logged workout
CREATE TABLE IF NOT EXISTS public.log_sets (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  log_exercise_id BIGINT NOT NULL REFERENCES public.log_exercises(id) ON DELETE CASCADE,
  member_id BIGINT REFERENCES public.members(id) ON DELETE SET NULL,
  reps INT,
  weight NUMERIC(10, 2),
  unit TEXT DEFAULT 'lbs' CHECK (unit IN ('lbs', 'kg', 'bw')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 2. CREATE INDEXES
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_members_client_uid ON public.members(client_uid);
CREATE INDEX IF NOT EXISTS idx_exercises_client_uid ON public.exercises(client_uid);
CREATE INDEX IF NOT EXISTS idx_exercises_category ON public.exercises(category);
CREATE INDEX IF NOT EXISTS idx_workout_logs_client_uid ON public.workout_logs(client_uid);
CREATE INDEX IF NOT EXISTS idx_workout_logs_date ON public.workout_logs(date DESC);
CREATE INDEX IF NOT EXISTS idx_workout_plans_client_uid ON public.workout_plans(client_uid);
CREATE INDEX IF NOT EXISTS idx_workout_plans_date ON public.workout_plans(date);
CREATE INDEX IF NOT EXISTS idx_plan_exercises_plan_id ON public.plan_exercises(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_exercises_exercise_id ON public.plan_exercises(exercise_id);
CREATE INDEX IF NOT EXISTS idx_log_members_log_id ON public.log_members(log_id);
CREATE INDEX IF NOT EXISTS idx_log_members_member_id ON public.log_members(member_id);
CREATE INDEX IF NOT EXISTS idx_log_exercises_log_id ON public.log_exercises(log_id);
CREATE INDEX IF NOT EXISTS idx_log_exercises_exercise_id ON public.log_exercises(exercise_id);
CREATE INDEX IF NOT EXISTS idx_log_sets_log_exercise_id ON public.log_sets(log_exercise_id);
CREATE INDEX IF NOT EXISTS idx_log_sets_member_id ON public.log_sets(member_id);

-- ==========================================
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- ==========================================

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.log_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.log_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.log_sets ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 4. CREATE ANONYMOUS POLICIES
-- ==========================================
-- Note: These policies allow anonymous (unauthenticated) users to perform full CRUD.
-- For production, restrict to authenticated users and add user_id foreign keys.

-- Members policies
DROP POLICY IF EXISTS "anon_all_members" ON public.members;
CREATE POLICY "anon_all_members" ON public.members
  FOR ALL TO anon
  USING (TRUE)
  WITH CHECK (TRUE);

-- Exercises policies
DROP POLICY IF EXISTS "anon_all_exercises" ON public.exercises;
CREATE POLICY "anon_all_exercises" ON public.exercises
  FOR ALL TO anon
  USING (TRUE)
  WITH CHECK (TRUE);

-- Workout plans policies
DROP POLICY IF EXISTS "anon_all_workout_plans" ON public.workout_plans;
CREATE POLICY "anon_all_workout_plans" ON public.workout_plans
  FOR ALL TO anon
  USING (TRUE)
  WITH CHECK (TRUE);

-- Plan exercises policies
DROP POLICY IF EXISTS "anon_all_plan_exercises" ON public.plan_exercises;
CREATE POLICY "anon_all_plan_exercises" ON public.plan_exercises
  FOR ALL TO anon
  USING (TRUE)
  WITH CHECK (TRUE);

-- Workout logs policies
DROP POLICY IF EXISTS "anon_all_workout_logs" ON public.workout_logs;
CREATE POLICY "anon_all_workout_logs" ON public.workout_logs
  FOR ALL TO anon
  USING (TRUE)
  WITH CHECK (TRUE);

-- Log members policies
DROP POLICY IF EXISTS "anon_all_log_members" ON public.log_members;
CREATE POLICY "anon_all_log_members" ON public.log_members
  FOR ALL TO anon
  USING (TRUE)
  WITH CHECK (TRUE);

-- Log exercises policies
DROP POLICY IF EXISTS "anon_all_log_exercises" ON public.log_exercises;
CREATE POLICY "anon_all_log_exercises" ON public.log_exercises
  FOR ALL TO anon
  USING (TRUE)
  WITH CHECK (TRUE);

-- Log sets policies
DROP POLICY IF EXISTS "anon_all_log_sets" ON public.log_sets;
CREATE POLICY "anon_all_log_sets" ON public.log_sets
  FOR ALL TO anon
  USING (TRUE)
  WITH CHECK (TRUE);

-- ==========================================
-- 5. SEED DEFAULT EXERCISES (OPTIONAL)
-- ==========================================
-- This will add default exercises if they don't exist

INSERT INTO public.exercises (name, category) VALUES
  ('Light Cardio Warmup', 'warmup'),
  ('Dynamic Stretching', 'warmup'),
  ('Foam Rolling', 'warmup'),
  ('Bench Press', 'chest'),
  ('Incline Dumbbell Press', 'chest'),
  ('Cable Flyes', 'chest'),
  ('Decline Press', 'chest'),
  ('Machine Chest Press', 'chest'),
  ('Pull-Ups', 'back'),
  ('Barbell Row', 'back'),
  ('Lat Pulldown', 'back'),
  ('Rows Machine', 'back'),
  ('Assisted Pull-Ups', 'back'),
  ('Squat', 'legs'),
  ('Deadlift', 'legs'),
  ('Bulgarian Split Squat', 'legs'),
  ('Leg Press', 'legs'),
  ('Box Jump', 'legs'),
  ('Leg Curl', 'legs'),
  ('Leg Extension', 'legs'),
  ('Calf Raises', 'legs'),
  ('Shoulder Press', 'shoulders'),
  ('Lateral Raises', 'shoulders'),
  ('Face Pulls', 'shoulders'),
  ('Shrug', 'shoulders'),
  ('Pike Push-Ups', 'shoulders'),
  ('Bicep Curls', 'arms'),
  ('Tricep Dips', 'arms'),
  ('Skull Crushers', 'arms'),
  ('Tricep Rope Pushdown', 'arms'),
  ('Hammer Curls', 'arms'),
  ('Barbell Curl', 'arms'),
  ('Plank', 'core'),
  ('Ab Wheel Rollout', 'core'),
  ('Dead Bug', 'core'),
  ('Hanging Leg Raise', 'core'),
  ('Decline Sit-Ups', 'core'),
  ('Pallof Press', 'core'),
  ('Running', 'cardio'),
  ('Rowing Machine', 'cardio'),
  ('Stair Climber', 'cardio'),
  ('Jump Rope', 'cardio'),
  ('Bike', 'cardio'),
  ('Elliptical', 'cardio')
ON CONFLICT DO NOTHING;

-- ==========================================
-- 6. VERIFY SCHEMA
-- ==========================================
-- Run this query to verify all tables were created:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
