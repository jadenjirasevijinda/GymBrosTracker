-- ===================================================
-- IRON LOG - Verify & Apply RLS Policies
-- ===================================================
-- Run this in your Supabase SQL Editor to ensure
-- all Row Level Security policies are correctly set

-- Check current policies
-- SELECT * FROM pg_policies WHERE tablename IN (
--   'members', 'exercises', 'workout_logs', 'log_members', 
--   'log_exercises', 'log_sets', 'workout_plans', 'plan_exercises'
-- );

-- ===================================================
-- STEP 1: Ensure RLS is enabled on all tables
-- ===================================================
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.log_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.log_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.log_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_exercises ENABLE ROW LEVEL SECURITY;

-- ===================================================
-- STEP 2: Drop existing policies (if any) to avoid conflicts
-- ===================================================
DROP POLICY IF EXISTS "anon_all_members" ON public.members;
DROP POLICY IF EXISTS "anon_all_exercises" ON public.exercises;
DROP POLICY IF EXISTS "anon_all_workout_logs" ON public.workout_logs;
DROP POLICY IF EXISTS "anon_all_log_members" ON public.log_members;
DROP POLICY IF EXISTS "anon_all_log_exercises" ON public.log_exercises;
DROP POLICY IF EXISTS "anon_all_log_sets" ON public.log_sets;
DROP POLICY IF EXISTS "anon_all_workout_plans" ON public.workout_plans;
DROP POLICY IF EXISTS "anon_all_plan_exercises" ON public.plan_exercises;

-- Also drop any old-style policies from previous schema
DROP POLICY IF EXISTS "anon_select_members" ON public.members;
DROP POLICY IF EXISTS "anon_insert_members" ON public.members;
DROP POLICY IF EXISTS "anon_delete_members" ON public.members;
DROP POLICY IF EXISTS "anon_select_exercises" ON public.exercises;
DROP POLICY IF EXISTS "anon_insert_exercises" ON public.exercises;
DROP POLICY IF EXISTS "anon_select_workout_logs" ON public.workout_logs;
DROP POLICY IF EXISTS "anon_insert_workout_logs" ON public.workout_logs;
DROP POLICY IF EXISTS "anon_insert_log_members" ON public.log_members;
DROP POLICY IF EXISTS "anon_insert_log_exercises" ON public.log_exercises;
DROP POLICY IF EXISTS "anon_insert_log_sets" ON public.log_sets;
DROP POLICY IF EXISTS "anon_select_workout_plans" ON public.workout_plans;
DROP POLICY IF EXISTS "anon_insert_workout_plans" ON public.workout_plans;
DROP POLICY IF EXISTS "anon_insert_plan_exercises" ON public.plan_exercises;

-- ===================================================
-- STEP 3: Create unified CRUD policies (simplified)
-- ===================================================
-- These policies allow anonymous (unauthenticated) users
-- full read/write/delete access to all tables.
-- Suitable for personal/friend-group apps with PIN gate.

-- Members: Full access
CREATE POLICY "Allow anon all operations on members" 
  ON public.members FOR ALL TO anon
  USING (TRUE) WITH CHECK (TRUE);

-- Exercises: Full access
CREATE POLICY "Allow anon all operations on exercises" 
  ON public.exercises FOR ALL TO anon
  USING (TRUE) WITH CHECK (TRUE);

-- Workout plans: Full access
CREATE POLICY "Allow anon all operations on workout_plans" 
  ON public.workout_plans FOR ALL TO anon
  USING (TRUE) WITH CHECK (TRUE);

-- Plan exercises: Full access
CREATE POLICY "Allow anon all operations on plan_exercises" 
  ON public.plan_exercises FOR ALL TO anon
  USING (TRUE) WITH CHECK (TRUE);

-- Workout logs: Full access
CREATE POLICY "Allow anon all operations on workout_logs" 
  ON public.workout_logs FOR ALL TO anon
  USING (TRUE) WITH CHECK (TRUE);

-- Log members: Full access
CREATE POLICY "Allow anon all operations on log_members" 
  ON public.log_members FOR ALL TO anon
  USING (TRUE) WITH CHECK (TRUE);

-- Log exercises: Full access
CREATE POLICY "Allow anon all operations on log_exercises" 
  ON public.log_exercises FOR ALL TO anon
  USING (TRUE) WITH CHECK (TRUE);

-- Log sets: Full access
CREATE POLICY "Allow anon all operations on log_sets" 
  ON public.log_sets FOR ALL TO anon
  USING (TRUE) WITH CHECK (TRUE);

-- ===================================================
-- STEP 4: Verify policies were created
-- ===================================================
-- Run this query to confirm all policies exist:
-- SELECT 
--   schemaname,
--   tablename,
--   policyname,
--   permissive,
--   roles
-- FROM pg_policies 
-- WHERE schemaname = 'public' 
--   AND tablename IN (
--     'members', 'exercises', 'workout_logs', 'log_members',
--     'log_exercises', 'log_sets', 'workout_plans', 'plan_exercises'
--   )
-- ORDER BY tablename, policyname;

-- You should see 8 policies (one per table).
-- All should have roles = {anon}

-- ===================================================
-- SUCCESS!
-- ===================================================
-- If you see no errors above, your database is
-- ready for IRON LOG with full anonymous access.
--
-- Your app can now save and retrieve all data!
