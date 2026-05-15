# IRON LOG — Quick Reference

## Keyboard Shortcuts & Tips

| Action | How To |
|--------|-------|
| Submit PIN | Enter PIN + Press Enter (or click UNLOCK) |
| Toggle Navigation | Click nav buttons at top |
| Add Exercise | Click "+ ADD EXERCISE" |
| Add Set | Click "+ SET" next to member name |
| Remove Set | Click "✕" on the right of set row |
| Search History | Type in search box (searches by name/date) |
| Expand Workout Details | Click on workout entry in history |
| Load Plan to Log | Click "USE NOW" on any saved plan |
| Adjust Rest Timer | Use preset buttons or enter custom time |
| Start/Pause Timers | Click "START" or "PAUSE" |
| Add Member | Click "+ ADD MEMBER" button |
| Delete Member | Click "✕" in top-right of member card |

---

## Common Tasks

### Log Today's Workout

1. Click **Log Workout** tab
2. Date should auto-fill with today
3. Enter session name (e.g., "Chest Day")
4. Select members (click their names)
5. For each exercise:
   - Select exercise from dropdown
   - Click "+ SET" for each member
   - Fill in Reps / Weight / Unit (lbs or kg)
6. Click **💾 SAVE SESSION**

### Plan a Workout

1. Click **Plan Workout** tab
2. Set date for when you want to do it
3. Enter workout name
4. Click "+ ADD EXERCISE" for each exercise
5. Set target sets/reps/weight
6. Click **💾 SAVE PLAN**

Later:
1. Go to **Plan Workout** tab
2. Find your plan
3. Click "USE NOW"
4. Exercises load into logger
5. Log your actual sets/reps

### Review Past Workout

1. Click **History** tab
2. Click workout entry to expand
3. See breakdown by member
4. Click the 3-dot date link to open modal with full details

### Add Custom Exercise

1. Click **Plan Workout** tab
2. Scroll down to "EXERCISE NOT IN LIST? ADD IT"
3. Click button to show form
4. Enter exercise name
5. Select category
6. Click "SAVE TO LIBRARY"

Now available in all dropdowns.

### Use Rest Timer

1. Click ⏱ **TIMERS** in header (or in Nav)
2. Under "Rest Timer":
   - Click preset (0:30, 1:00, 1:30, 2:00, 3:00)
   - Or enter custom seconds and click APPLY
   - Click **START**
3. Timer counts down
4. When done: beep + vibration + notification

### Check Supabase Status

1. Click ⏱ **TIMERS**
2. Scroll to "Supabase Status" section
3. See connection status
4. Click "RETRY CONNECT" to reconnect
5. Click "TEST DB" to verify
6. Click "COPY LAST ERROR" for troubleshooting

---

## Data Structure Reference

### Reps / Weight Notation

Examples:
- **Reps**: 10, 8, 5-8, 3x5, etc. (any format you want)
- **Weight**: 135, 225, 315, etc.
- **Unit**: lbs (pounds), kg (kilograms), BW (bodyweight)

### Exercises

Built-in categories:
- Warmup (cardio warmup, stretching, foam rolling)
- Chest (bench, incline, flyes)
- Back (rows, pull-ups, lat pulldown)
- Legs (squats, deadlifts, leg press)
- Shoulders (overhead press, laterals, face pulls)
- Arms (curls, dips, skull crushers)
- Core (planks, ab wheel, hanging leg raise)
- Cardio (running, rowing, bike)
- Other (catch-all)

### Member Tags

Optional role for each member:
- "lifter" / "bodybuilder"
- "cardio king" / "runner"
- "beast mode"
- Any custom tag

---

## Settings & Customization

### Change PIN

1. Open `index.html` in text editor
2. Find `const APP_PIN = '4156';`
3. Replace `4156` with your PIN
4. Save and reload

### Change Supabase Credentials

1. Open `index.html` in text editor
2. Find:
   ```javascript
   const SUPABASE_URL = '...';
   const SUPABASE_ANON_KEY = '...';
   ```
3. Replace with your project's credentials
4. Save and reload

### Clear All Data

**⚠️ Warning: This cannot be undone!**

In browser console (F12):
```javascript
localStorage.clear()
location.reload()
```

Or: Settings → Application → Storage → Clear Site Data

---

## Troubleshooting Quick Fixes

| Problem | Solution |
|---------|----------|
| App won't load | Clear cache (Ctrl+Shift+Delete) and reload |
| PIN not working | Clear localStorage (see above) |
| Can't add members | Make sure Supabase is connected (check timer status) |
| Timers not notifying | Enable notifications in browser settings |
| Data not saving | Check Supabase status in Timers tab |
| Exercise dropdown empty | Add exercises in "Plan Workout" tab first |
| Can't see members | Members tab is empty; click "+ ADD MEMBER" |
| Stuck on PIN screen | Browser may have cached old PIN; clear localStorage |

---

## Advanced: Direct Database Query

If you need to check/edit data directly:

1. Go to Supabase dashboard
2. Click **SQL Editor**
3. Write queries like:

```sql
-- See all workouts
SELECT * FROM workout_logs ORDER BY date DESC;

-- See all sets from a specific workout
SELECT ls.*, e.name FROM log_sets ls
JOIN log_exercises le ON ls.log_exercise_id = le.id
JOIN exercises e ON le.exercise_id = e.id
WHERE le.log_id = 123; -- Replace 123 with log ID

-- Delete a workout (cascades to sets/exercises)
DELETE FROM workout_logs WHERE id = 123;

-- Rename an exercise
UPDATE exercises SET name = 'New Name' WHERE id = 456;
```

---

## Performance Tips

- **Mobile**: Close browser tabs to free RAM for timers
- **Offline Sync**: Sync manually if app feels slow (click refresh)
- **Storage**: Delete old workout entries to free space
- **Browser Cache**: Clear every few months for best performance

---

## Browser DevTools Tips

### Check Saved Data
1. Press F12 (open DevTools)
2. Go to **Application** tab
3. Click **Local Storage**
4. Select your domain
5. Look for keys starting with `ironlog_`

### View Console Logs
1. Press F12
2. Go to **Console** tab
3. Look for setup info and any errors

### Check Network Requests
1. Press F12
2. Go to **Network** tab
3. Try saving a workout
4. See POST requests to `supabase.co`

---

## Keyboard Navigation

- **Tab**: Move between fields
- **Enter**: Submit forms / PIN
- **Escape**: Close modals
- **Arrow keys**: Navigate dropdowns

---

## Mobile Tips

- **Home Screen**: Safari → Share → Add to Home Screen
- **Notifications**: Settings → Websites → IRON LOG → Allow
- **Landscape**: Rotate phone for better timer view
- **Offline**: Works perfectly offline; no WiFi needed for logging

---

## Export Data

To backup or share:

### Export as JSON (in console)
```javascript
const data = {
  members, exercises, workoutLogs, workoutPlans
};
console.log(JSON.stringify(data, null, 2));
// Copy from console, save as backup.json
```

### Export Supabase Data (via dashboard)
1. Go to Supabase dashboard
2. Click **SQL Editor**
3. Run queries and export as CSV

---

## Sync Status Codes

| Status | Meaning |
|--------|---------|
| **CONNECTED** | Cloud available, syncing enabled |
| **OFFLINE** | Using local storage only |
| **CONNECTING** | Trying to reach Supabase |
| **SCHEMA ERROR** | Database tables don't exist (run SQL) |
| **RLS ERROR** | Permissions issue (check policies) |

---

**Need more help?** See `SETUP_GUIDE.md` for detailed instructions or check comments in `index.html`.
