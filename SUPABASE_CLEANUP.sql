-- IRON LOG: cleanup helpers for duplicates / client_uid issues
-- Run in Supabase SQL editor (Database → SQL Editor).

-- 1) See if any duplicate client_uid exists (should be 0 rows if the UNIQUE constraint is active).
select client_uid, count(*)
from public.exercises
where client_uid is not null
group by client_uid
having count(*) > 1;

-- 2) Find duplicates by name (case-insensitive). These can happen if multiple devices added the same exercise.
select lower(trim(name)) as name_key, count(*) as n
from public.exercises
group by lower(trim(name))
having count(*) > 1
order by n desc, name_key asc;

-- 3) Optional: keep one row per name_key and delete the rest.
-- WARNING: This will delete rows and may break references in log_exercises/plan_exercises if you don't re-point them.
-- If you want to do a safe merge, do NOT run this block; instead, ask and we’ll generate a merge script that updates FKs.
/*
with ranked as (
  select
    id,
    lower(trim(name)) as name_key,
    row_number() over (
      partition by lower(trim(name))
      order by (client_uid is not null) desc, id asc
    ) as rn
  from public.exercises
)
delete from public.exercises e
using ranked r
where e.id = r.id
  and r.rn > 1;
*/

-- 4) Optional: If you’re getting `duplicate key ... exercises_client_uid_ux` during sync,
-- you can temporarily clear client_uid on rows that are duplicates by *name* so the app can re-attach cleanly.
-- This is non-destructive (doesn't delete rows), but it does remove client_uid values for some duplicates.
/*
with dups as (
  select lower(trim(name)) as name_key
  from public.exercises
  group by lower(trim(name))
  having count(*) > 1
),
ranked as (
  select
    id,
    lower(trim(name)) as name_key,
    row_number() over (
      partition by lower(trim(name))
      order by (client_uid is not null) desc, id asc
    ) as rn
  from public.exercises
  where lower(trim(name)) in (select name_key from dups)
)
update public.exercises e
set client_uid = null
from ranked r
where e.id = r.id
  and r.rn > 1;
*/

