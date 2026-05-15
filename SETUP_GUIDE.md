# IRON LOG - Complete Setup Guide

## Overview
IRON LOG is a gym tracking app built with vanilla HTML/CSS/JS and Supabase. It lets you:
- Track gym workouts with sets, reps, and weights
- Manage gym members/crew
- Plan workouts in advance
- Use built-in timers with notifications
- Sync data between devices
- Access offline and sync when online

---

## Quick Start (3 Steps)

### Step 1: Create a Supabase Project
1. Go to [https://supabase.com](https://supabase.com)
2. Click **"New Project"**
3. Fill in:
   - Project name: `iron-log` (or any name)
   - Database password: Create a strong password
   - Region: Choose closest to you
4. Wait ~2 minutes for it to deploy
5. Go to **Settings → API** in the left sidebar

### Step 2: Get Your Credentials
From the **Settings → API** page:
1. Copy your **Project URL** (looks like `https://xxxxx.supabase.co`)
2. Copy your **Anon Public Key** (starts with `eyJ...`)
   - ⚠️ Use the **anon** key, NOT the service_role key

### Step 3: Setup Database Schema
1. In Supabase, go to **SQL Editor** (left sidebar)
2. Click **"New Query"**
3. Copy the entire contents of `supabase_schema.sql` from this repo
4. Paste it into the SQL editor
5. Click **"Run"**
6. Wait for it to complete (should show no errors)

---

## Update the App with Your Credentials

### Option A: Hardcoded (Easiest - for personal use)
1. Open `index.html` in a text editor
2. Find this section (around line 950):
```javascript
const SUPABASE_URL = 'https://vvewurwnkocezvuwstxm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
const APP_PIN = '4156';
```
3. Replace:
   - `SUPABASE_URL` with your Project URL
   - `SUPABASE_ANON_KEY` with your Anon Public Key
   - `APP_PIN` with a 4-digit PIN (optional, for friend-only access)
4. Save the file
5. Reload the app in your browser

### Option B: Environment Variables (More secure)
If deploying to a server:
1. Store credentials in environment variables
2. Load them via a server endpoint
3. Contact your hosting provider for details

---

## Using the App

### Dashboard
- See weekly/total workout stats
- View activity calendar
- Check recent sessions
- Quick links to log/plan workouts

### Log Workout
1. Select date and session name
2. Select who's participating (chips)
3. Add exercises by clicking "+ ADD EXERCISE"
4. For each member, fill in sets/reps/weight
5. Add notes (optional)
6. Click "SAVE SESSION"

### Plan Workout
1. Set date for planned workout
2. Add exercises with target sets/reps/weight
3. Click "SAVE PLAN"
4. Later, click "USE NOW" to load plan into the logger

### History
- View all past workouts
- Click to expand and see details
- Search by workout name or date

### Members
- Add crew members with optional role/tag
- See how many sessions each member participated in
- Remove members (optional)

### Timers
- Rest timer with presets (30s, 1m, 1:30, 2m, 3m)
- Custom time entry
- Workout stopwatch
- Notifications when rest is over
- Persistent across browser reloads

---

## Offline & Sync

### How It Works
- All data auto-saves to browser's `localStorage` when Supabase isn't connected
- When Supabase connects, data auto-syncs from local → cloud
- Download works offline; just reload once connected to see cloud updates

### Manual Sync
- Click the "🔄" refresh button in the header
- Or click **Timers → Supabase Status → "RETRY CONNECT"**

### Local-Only Mode
- If you don't set up Supabase, app works fully offline
- Data only persists in browser storage (won't sync to other devices)

---

## Supabase Schema Reference

### Tables Created

#### `members`
- `id`: Auto-incrementing ID
- `name`: Member name (required)
- `tag`: Optional role/nickname
- `client_uid`: For offline-to-cloud sync
- `created_at` / `updated_at`: Timestamps

#### `exercises`
- `id`: Auto-incrementing ID
- `name`: Exercise name (required)
- `category`: Warmup, Chest, Back, Legs, Shoulders, Arms, Core, Cardio, Other
- `client_uid`: For offline-to-cloud sync

#### `workout_logs`
- `id`: Auto-incrementing ID
- `date`: Workout date (required)
- `name`: Session name/type
- `notes`: Optional notes
- `client_uid`: For offline-to-cloud sync

#### `log_members`
- Links members to a workout session
- `log_id` → `workout_logs`
- `member_id` → `members`

#### `log_exercises`
- Links exercises to a logged workout
- `log_id` → `workout_logs`
- `exercise_id` → `exercises`

#### `log_sets`
- Individual set data (reps, weight, unit)
- `log_exercise_id` → `log_exercises`
- `member_id` → `members` (which member did this set)
- `reps`: Number of reps
- `weight`: Weight amount
- `unit`: lbs, kg, or BW (bodyweight)

#### `workout_plans`
- Planned/templated workouts
- `date`: When planned for
- `name`: Workout name
- `client_uid`: For offline-to-cloud sync

#### `plan_exercises`
- Exercises in a plan template
- `plan_id` → `workout_plans`
- `exercise_id` → `exercises`
- `target_sets`, `target_reps`, `target_weight`: Goal targets
- `order_index`: Exercise order

---

## Troubleshooting

### "Supabase not connected" error
1. Check your URL/Key are correct
2. Verify Supabase project is running (check dashboard)
3. Ensure schema migrations ran (check SQL Editor for tables)
4. Try clicking **Timers → "RETRY CONNECT"**

### Data not saving
1. Check browser console for errors (F12 → Console tab)
2. Click **Timers → "COPY LAST ERROR"** to see detailed error
3. Verify RLS policies are set (should be in schema file)
4. Check network tab (F12 → Network) for failed requests

### "Table not found" error
- You haven't run the SQL schema yet
- Go back to **Step 3** in the setup guide
- Copy and run `supabase_schema.sql` in Supabase SQL Editor

### Member/Exercise selectors show nothing
- Add members in the **Members** tab first
- Verify your Supabase schema has the `members` table

### Timers not working
- Check browser notifications are enabled
- Click **Timers → "ENABLE"** to allow notifications
- Some browsers require HTTPS for notifications

### PIN gate not working
- Clear localStorage: Settings → Application Storage → Clear
- Try refreshing the page
- Default PIN is `4156` (change in code)

---

## Security Notes

⚠️ **Important for Production Use:**

1. **Anonymous Access**: The RLS policies allow anonymous (unauthenticated) users full CRUD access. This is fine for personal/friend-only use (with the PIN gate), but NOT secure for public apps.

2. **Better Security**:
   - Enable Supabase Auth and require login
   - Add `user_id` column to tables
   - Restrict policies to `auth.uid() = user_id`
   - See: https://supabase.com/docs/guides/auth

3. **PIN Gate**: The PIN is client-side only and visible in the source code. Use it to deter casual users, not for real security. Real authentication requires Supabase Auth or similar.

4. **API Keys**: Never commit `SUPABASE_ANON_KEY` to public repos. Use environment variables or GitHub Secrets for deployment.

---

## Deployment

### Option 1: Static Host (Vercel, Netlify, GitHub Pages)
1. Push this repo to GitHub
2. Connect to Vercel/Netlify
3. Set environment variables or hardcode credentials
4. Deploy
5. Access via your custom domain

### Option 2: Self-Hosted
1. Copy `index.html` to your server
2. Serve over HTTPS
3. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY`

### Option 3: Mobile App
- Save as PWA (add to home screen on iOS/Android)
- Works fully offline, syncs when online

---

## Features

✅ **Completed:**
- Multi-member workout logging
- Planned workouts
- Workout history with search
- Member management
- Built-in timers & notifications
- Offline-first with cloud sync
- Dark theme UI
- Mobile responsive
- PIN gate for privacy

🔄 **Future Enhancements:**
- Personal records (1RM calculations)
- Progress charts/analytics
- Export to CSV
- Barcode exercise QR codes
- Voice input for logging
- Social sharing

---

## API / Data Structure

If you want to build a companion app or integrate with other tools:

### Fetch Recent Workouts
```javascript
const workouts = await fetch(
  'https://YOUR_PROJECT.supabase.co/rest/v1/workout_logs?select=*,log_exercises(exercise:exercises(*),log_sets(*))&order=date.desc&limit=10',
  {
    headers: {
      apikey: 'YOUR_ANON_KEY',
      Authorization: `Bearer YOUR_ANON_KEY`
    }
  }
).then(r => r.json());
```

### Insert a Workout
```javascript
await fetch(
  'https://YOUR_PROJECT.supabase.co/rest/v1/workout_logs',
  {
    method: 'POST',
    headers: {
      apikey: 'YOUR_ANON_KEY',
      Authorization: `Bearer YOUR_ANON_KEY`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      date: '2025-05-14',
      name: 'Chest Day',
      notes: 'Strong workout!'
    })
  }
);
```

See [Supabase PostgREST docs](https://supabase.com/docs/guides/api) for full API reference.

---

## License
Public domain. Use freely, modify as needed, no attribution required.

## Questions?
Check the inline comments in `index.html` and `supabase_schema.sql` for detailed technical notes.
