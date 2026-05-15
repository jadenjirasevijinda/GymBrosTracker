-- IRON LOG - RLS Setup Instructions
-- =====================================================

-- Step 1: Run the RLS policies from rls_policies.sql
-- (Copy the entire file from your repo)

-- Step 2: After running policies, verify they're active:

SELECT 
  tablename,
  policyname,
  permissive,
  roles::text,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN (
    'members', 'exercises', 'workout_logs', 'log_members',
    'log_exercises', 'log_sets', 'workout_plans', 'plan_exercises'
  )
ORDER BY tablename;

-- Expected result: You should see 8 rows (one policy per table)
-- All should show:
--   permissive: true
--   roles: {anon}
--   qual: (true)
--   with_check: (true)

-- Step 3: Test write access with this query:
INSERT INTO public.members (name, tag) VALUES ('TEST_MEMBER', 'test') 
RETURNING id, name;

-- If this succeeds, RLS is working! Otherwise you'll see a permission error.

-- Step 4: After confirming it works, DELETE the test member:
DELETE FROM public.members WHERE name = 'TEST_MEMBER';

-- Step 5: Done! Your app can now save data.
