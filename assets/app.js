// =====================
//   SUPABASE CLIENT
// =====================
let sb = null;
let sbReady = false;
let pendingPlanForLog = null;
let lastDbError = '';
let lastSupabaseLoadError = '';
let lastSupabaseSourceTried = '';

// =====================
//   EMBEDDED SUPABASE CONFIG
// =====================
// Paste your real Supabase Project URL and anon public key below.
// IMPORTANT: Use the anon public key only. Do NOT paste your service_role key into frontend code.
const SUPABASE_URL = 'https://vvewurwnkocezvuwstxm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2ZXd1cndua29jZXp2dXdzdHhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MDg1ODAsImV4cCI6MjA5NDM4NDU4MH0.h1K-jFB9CoEOiZRvGtHLkXRAJKWQrvQ5fCrM8HtDcAM';
// Simple PIN gate (friends). Change this PIN before sharing.
const APP_PIN = '4156';

// We avoid loading supabase-js (CDNs often blocked on mobile / school Wi‑Fi).
// Instead we call Supabase PostgREST directly via fetch.
const SUPABASE_REST = () => `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;

function sbHeaders(extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function sbFetch(path, { method = 'GET', body = null, headers = {}, accept = 'application/json' } = {}) {
  const url = `${SUPABASE_REST()}${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await fetch(url, {
    method,
    headers: { ...sbHeaders({ Accept: accept }), ...headers },
    body: body == null ? null : JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    const msg = (json && (json.message || json.error_description || json.error))
      ? (json.message || json.error_description || json.error)
      : (text || `${res.status} ${res.statusText}`);
    const err = new Error(msg);
    err.status = res.status;
    err.payload = json || text;
    throw err;
  }
  return json;
}

async function sbPing() {
  // If RLS blocks select, this will return a helpful error.
  await sbFetch('/members?select=id&limit=1', { method: 'GET' });
}

function initSupabase(useEmbedded = false) {
  const url = useEmbedded
    ? SUPABASE_URL.trim()
    : document.getElementById('sb-url')?.value.trim();

  const key = useEmbedded
    ? SUPABASE_ANON_KEY.trim()
    : document.getElementById('sb-key')?.value.trim();

  if (!url || !key) {
    showStatus('Supabase URL/key missing from embedded constants.', 'error');
    return;
  }

  // Mark as not-ready until we verify PostgREST is reachable.
  sbReady = false;
  sb = null;
  lastDbError = '';
  lastSupabaseLoadError = '';
  lastSupabaseSourceTried = 'postgrest';
  updateSupabaseStatusUI();

  sbPing().then(() => {
    // First verify schema exists
    return setupTables();
  }).then(() => {
    sbReady = true;
    showStatus('Supabase connected! ✓', 'success');
    return loadAll().then(() => {
      syncLocalToSupabase().catch(() => {});
    });
  }).then(() => {
    updateSupabaseStatusUI();
  }).catch((e) => {
    sbReady = false;
    const msg = e?.message || String(e);
    lastSupabaseLoadError = msg;
    lastDbError = msg;
    
    // Check if error is about missing schema
    if (/table|schema|not found|does not exist|migration/i.test(msg)) {
      showStatus(`Setup required: ${msg}. See the supabase_schema.sql file for setup.`, 'error');
    } else {
      showStatus('Supabase connection failed: ' + msg, 'error');
    }
    updateSupabaseStatusUI();
  });
}

function autoInitSupabase() {
  if (SUPABASE_URL.trim() && SUPABASE_ANON_KEY.trim()) {
    initSupabase(true);
  }
}

async function setupTables() {
  // Verify tables exist by checking schema
  try {
    // Try a simple query to each table to verify they exist
    const tables = ['members', 'exercises', 'workout_logs', 'workout_plans'];
    for (const table of tables) {
      try {
        await sbFetch(`/${table}?select=id&limit=0`, { method: 'GET' });
      } catch (e) {
        if (e.status === 404 || /not found|does not exist/i.test(e.message)) {
          throw new Error(`Table '${table}' not found. Run the SQL schema migration in Supabase.`);
        }
        throw e;
      }
    }
  } catch (e) {
    throw new Error(`Schema verification failed: ${e.message}`);
  }
}

async function sbInsert(table, data) {
  if (!sbReady) { showStatus('Connect Supabase first!', 'error'); return null; }
  try {
    const d = await sbFetch(`/${table}?select=*`, {
      method: 'POST',
      body: data,
      headers: { Prefer: 'return=representation' }
    });
    return d;
  } catch (e) {
    lastDbError = e.message || String(e);
    showStatus('DB error: ' + lastDbError, 'error');
    console.error(e);
    return null;
  }
}

async function sbSelect(table, query) {
  if (!sbReady) return [];
  try {
    const q = encodeURIComponent(query || '*');
    const data = await sbFetch(`/${table}?select=${q}`, { method: 'GET' });
    return data || [];
  } catch (e) {
    console.error(e);
    lastDbError = e.message || String(e);
    showStatus('DB error: ' + lastDbError, 'error');
    return [];
  }
}

async function sbDelete(table, id) {
  if (!sbReady) return;
  try {
    await sbFetch(`/${table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  } catch (e) {
    lastDbError = e.message || String(e);
    showStatus('DB error: ' + lastDbError, 'error');
    console.error(e);
  }
}

async function sbUpdate(table, id, data) {
  if (!sbReady) return;
  try {
    await sbFetch(`/${table}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: data, headers: { Prefer: 'return=minimal' } });
  } catch (e) {
    lastDbError = e.message || String(e);
    showStatus('DB error: ' + lastDbError, 'error');
    console.error(e);
  }
}

// =====================
//   LOCAL STATE
// =====================
let members = [];
let exercises = [];
let workoutLogs = [];
let workoutPlans = [];
let calMonth = dayjs();

// Default exercises
// Intentionally empty to avoid clutter — add exercises manually as you go.
const DEFAULT_EXERCISES = [];

function getExerciseOptions(selectedId) {
  const grouped = {};
  exercises.forEach(e => {
    if (!grouped[e.category]) grouped[e.category] = [];
    grouped[e.category].push(e);
  });
  const cats = Object.keys(grouped).sort();
  return cats.map(cat => `
    <optgroup label="${cat.toUpperCase()}">
      ${grouped[cat].map(e => `<option value="${e.id}" ${e.id == selectedId ? 'selected' : ''}>${e.name}</option>`).join('')}
    </optgroup>
  `).join('');
}

function getMemberOptions(selectedId, { onlySelected = true, includeBlank = true } = {}) {
  const allowed = onlySelected && selectedMembers?.length
    ? members.filter(m => selectedMembers.includes(m.id))
    : members;

  const blank = includeBlank ? `<option value="" ${selectedId == null || selectedId === '' ? 'selected' : ''}>—</option>` : '';
  return blank + allowed.map(m => `<option value="${m.id}" ${m.id == selectedId ? 'selected' : ''}>${m.name}</option>`).join('');
}

function memberNameForId(id) {
  if (id == null || id === '') return '';
  const m = members.find(mm => mm.id == id);
  return m ? m.name : '';
}

function normalizeName(s) {
  return String(s || '').trim().toLowerCase();
}

function exerciseNameForId(id) {
  if (id == null || id === '') return '';
  const e = exercises.find(ee => ee.id == id);
  return e ? e.name : '';
}

// =====================
//   NAVIGATION
// =====================
const VIEW_TO_PAGE = {
  dashboard: 'index.html',
  log: 'log.html',
  plan: 'plan.html',
  history: 'history.html',
  members: 'members.html',
};

function pageForView(id) {
  return VIEW_TO_PAGE[id] || VIEW_TO_PAGE.dashboard;
}

function setNavActive(viewId) {
  document.querySelectorAll('nav a[data-view], nav button[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === viewId);
  });
}

function showView(id) {
  const viewEl = document.getElementById('view-' + id);
  if (!viewEl) {
    window.location.href = pageForView(id);
    return;
  }

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  viewEl.classList.add('active');
  setNavActive(id);

  if (id === 'dashboard') renderDashboard();
  if (id === 'history') renderHistory();
  if (id === 'plan') renderSavedPlans();
  if (id === 'members') renderMembers();
  if (id === 'log') initLog();
}

// =====================
//   LOAD ALL DATA
// =====================
async function loadAll() {
  if (!sbReady) {
    // use local state only (demo mode)
    exercises = [];
    renderDashboard();
    initLog();
    renderMembers();
    renderSavedPlans();
    if (document.getElementById('plan-date') && !planSlots.length) addPlanSlot();
    return;
  }

  members = await sbSelect('members');
  exercises = await sbSelect('exercises');
  // No auto-seeding exercises (keep library clean; add by hand).
  workoutLogs = await sbSelect('workout_logs', '*, log_exercises(*, log_sets(*), exercise:exercises(*)), log_members(*, member:members(*))');
  workoutPlans = await sbSelect('workout_plans', '*, plan_exercises(*, exercise:exercises(*))');

  renderDashboard();
  initLog();
  renderMembers();
  renderSavedPlans();
  renderCalendar();
  if (document.getElementById('plan-date') && !planSlots.length) addPlanSlot();
}

// =====================
//   DASHBOARD
// =====================
function renderDashboard() {
  if (!document.getElementById('stat-week')) return;
  const weekStart = dayjs().startOf('week');
  const thisWeek = workoutLogs.filter(w => dayjs(w.date).isAfter(weekStart) || dayjs(w.date).isSame(weekStart, 'day'));
  document.getElementById('stat-week').textContent = thisWeek.length;
  document.getElementById('stat-total').textContent = workoutLogs.length;
  document.getElementById('stat-members').textContent = members.length;

  const recent = [...workoutLogs].sort((a, b) => dayjs(b.date).unix() - dayjs(a.date).unix()).slice(0, 5);
  const el = document.getElementById('recent-list');
  if (!recent.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">🏋️</div><p>No workouts logged yet.</p></div>';
    return;
  }
  el.innerHTML = recent.map(w => `
    <div class="log-entry" onclick="openLogDetail(${w.id})">
      <div class="log-header">
        <div>
          <div class="log-date">${dayjs(w.date).format('MMM DD, YYYY')}</div>
          <div style="font-size:12px;color:var(--text2);font-family:'IBM Plex Mono',monospace;margin-top:3px">${w.name || 'Session'}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          ${(w.log_exercises || []).length ? `<span class="badge badge-yellow">${(w.log_exercises||[]).length} exercises</span>` : ''}
          <span style="color:var(--text3);font-size:18px">›</span>
        </div>
      </div>
    </div>
  `).join('');

  renderCalendar();
}

function renderCalendar() {
  const el = document.getElementById('calendar-grid');
  const label = document.getElementById('cal-month-label');
  if (!el || !label) return;
  label.textContent = calMonth.format('MMMM YYYY').toUpperCase();

  const start = calMonth.startOf('month');
  const daysInMonth = calMonth.daysInMonth();
  const startDow = start.day(); // 0=Sun

  const loggedDates = new Set(workoutLogs.map(w => w.date));
  const plannedDates = new Set(workoutPlans.map(p => p.date));

  const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  let html = days.map(d => `<div class="cal-day-name">${d}</div>`).join('');

  // empty cells
  for (let i = 0; i < startDow; i++) html += `<div class="cal-day empty"></div>`;

  const today = dayjs().format('YYYY-MM-DD');
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = calMonth.date(d).format('YYYY-MM-DD');
    const isToday = dateStr === today;
    const hasLog = loggedDates.has(dateStr);
    const hasPlan = plannedDates.has(dateStr);
    let cls = 'cal-day';
    if (isToday) cls += ' today';
    if (hasLog) cls += ' has-workout';
    else if (hasPlan) cls += ' has-planned';
    html += `<div class="${cls}">${d}</div>`;
  }
  el.innerHTML = html;
}

function changeMonth(dir) {
  calMonth = calMonth.add(dir, 'month');
  renderCalendar();
}

// =====================
//   LOG WORKOUT
// =====================
let logExercises = [];
let selectedMembers = [];
let exercisePickerCtx = null; // { kind: 'log'|'plan', idx: number }

function initLog() {
  if (!document.getElementById('log-date')) return;
  const today = dayjs().format('YYYY-MM-DD');
  document.getElementById('log-date').value = today;

  // Render member chips
  const chips = document.getElementById('log-members-chips');
  chips.innerHTML = members.map(m => `
    <div class="member-chip ${selectedMembers.includes(m.id) ? 'selected' : ''}" onclick="toggleMember(${m.id}, this)">${m.name}</div>
  `).join('') || '<span style="color:var(--text3);font-size:12px;font-family:IBM Plex Mono,monospace">No members yet — add some in the Members tab</span>';

  if (!logExercises.length) addLogExercise();
  syncLogMembers();
  renderLogExercises();
}

function toggleMember(id, el) {
  if (selectedMembers.includes(id)) {
    selectedMembers = selectedMembers.filter(m => m !== id);
    el.classList.remove('selected');
  } else {
    selectedMembers.push(id);
    el.classList.add('selected');
  }
  syncLogMembers();
  renderLogExercises();
}

function syncLogMembers() {
  // Ensure each logged exercise has a per-person block for each selected member.
  for (const ex of logExercises) {
    if (!ex.per_members) ex.per_members = [];
    const existing = new Map(ex.per_members.map(pm => [pm.member_id, pm]));
    ex.per_members = selectedMembers.map(mid => {
      const found = existing.get(mid);
      return found || { member_id: mid, sets: [{ reps: '', weight: '', unit: 'lbs' }] };
    });
  }
}

function addLogExercise() {
  logExercises.push({
    exercise_id: exercises[0]?.id || null,
    per_members: selectedMembers.map(mid => ({ member_id: mid, sets: [{ reps: '', weight: '', unit: 'lbs' }] }))
  });
  renderLogExercises();
}

function addLogExerciseAndPick() {
  const idx = logExercises.length;
  addLogExercise();
  openExercisePicker(idx);
  setTimeout(() => document.getElementById('picker-new-ex-name')?.focus(), 60);
}

function openExercisePicker(exIdx) { openExercisePickerFor('log', exIdx); }
function openPlanExercisePicker(slotIdx) { openExercisePickerFor('plan', slotIdx); }

function openExercisePickerFor(kind, idx) {
  exercisePickerCtx = { kind, idx };
  renderExercisePicker();
  openModal('modal-exercise-picker');
  setTimeout(() => document.getElementById('exercise-picker-search')?.focus(), 50);
}

function closeExercisePicker() {
  exercisePickerCtx = null;
  closeModal('modal-exercise-picker');
}

function renderExercisePicker() {
  const body = document.getElementById('exercise-picker-body');
  if (!body) return;

  let currentId = null;
  if (exercisePickerCtx?.kind === 'log' && logExercises[exercisePickerCtx.idx]) currentId = logExercises[exercisePickerCtx.idx].exercise_id;
  if (exercisePickerCtx?.kind === 'plan' && planSlots[exercisePickerCtx.idx]) currentId = planSlots[exercisePickerCtx.idx].exercise_id;

  const alreadyBuilt = !!document.getElementById('exercise-picker-search');
  if (!alreadyBuilt) {
    body.innerHTML = `
      <div class="picker-search">
        <div class="form-group" style="margin-bottom:0">
          <label>Search</label>
          <input id="exercise-picker-search" type="search" placeholder="Type to filter…"
            oninput="updateExercisePickerList()" autocomplete="off" />
        </div>
      </div>

      <div class="picker-add-box">
        <div class="card-label">Add New Exercise</div>
        <div class="grid-2" style="margin-top:10px">
          <div class="form-group" style="margin-bottom:0">
            <label>New Exercise Name</label>
            <input id="picker-new-ex-name" type="text" placeholder="e.g. Seated Cable Row" />
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label>Category</label>
            <select id="picker-new-ex-cat">
              <option value="warmup">warmup</option>
              <option value="chest">chest</option>
              <option value="back">back</option>
              <option value="legs">legs</option>
              <option value="shoulders">shoulders</option>
              <option value="arms">arms</option>
              <option value="core">core</option>
              <option value="cardio">cardio</option>
              <option value="other" selected>other</option>
            </select>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="addNewExerciseFromPicker()">+ ADD & SELECT</button>
          <button class="btn btn-secondary" onclick="closeExercisePicker()">CLOSE</button>
        </div>
        <div style="margin-top:10px;color:var(--text3);font-size:11px;font-family:'IBM Plex Mono',monospace">
          Tip: adding here updates your exercise library for everyone.
        </div>
      </div>

      <div style="margin-top:14px">
        <div class="card-label">Or Pick Existing</div>
        <div id="exercise-picker-list" class="picker-list" style="margin-top:10px"></div>
      </div>
    `;
  }

  updateExercisePickerList(currentId);
}

function updateExercisePickerList(forcedCurrentId = null) {
  const listEl = document.getElementById('exercise-picker-list');
  if (!listEl) return;
  const currentId = forcedCurrentId != null
    ? forcedCurrentId
    : (() => {
        if (exercisePickerCtx?.kind === 'log' && logExercises[exercisePickerCtx.idx]) return logExercises[exercisePickerCtx.idx].exercise_id;
        if (exercisePickerCtx?.kind === 'plan' && planSlots[exercisePickerCtx.idx]) return planSlots[exercisePickerCtx.idx].exercise_id;
        return null;
      })();

  const searchVal = normalizeName(document.getElementById('exercise-picker-search')?.value || '');
  const filtered = exercises
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
    .filter(e => !searchVal || normalizeName(e.name).includes(searchVal));

  listEl.innerHTML = `
    ${!filtered.length ? `<div style="color:var(--text3);font-size:12px;font-family:'IBM Plex Mono',monospace;padding:8px 0">No matches.</div>` : ''}
    ${filtered.map(e => `
      <button class="picker-item" onclick="chooseExerciseForLog(${e.id})" title="Select">
        <div>
          <div class="name">${e.name}</div>
          <div class="meta">${(e.category || 'other')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          ${String(e.id) === String(currentId) ? `<span class="badge badge-yellow">Selected</span>` : ``}
          <span style="color:var(--text3);font-size:18px">›</span>
        </div>
      </button>
    `).join('')}
  `;
}

function chooseExerciseForLog(exerciseId) {
  if (!exercisePickerCtx) return;
  if (exercisePickerCtx.kind === 'log') {
    if (!logExercises[exercisePickerCtx.idx]) return;
    logExercises[exercisePickerCtx.idx].exercise_id = exerciseId;
    renderLogExercises();
  } else if (exercisePickerCtx.kind === 'plan') {
    if (!planSlots[exercisePickerCtx.idx]) return;
    planSlots[exercisePickerCtx.idx].exercise_id = exerciseId;
    renderPlanSlots();
  }
  closeExercisePicker();
}

async function addNewExerciseFromPicker() {
  const name = document.getElementById('picker-new-ex-name')?.value || '';
  const category = document.getElementById('picker-new-ex-cat')?.value || 'other';
  const clean = name.trim();
  if (!clean) { showStatus('Enter an exercise name!', 'error'); return; }

  // If it already exists (case-insensitive), just select it.
  const existing = exercises.find(e => normalizeName(e.name) === normalizeName(clean));
  if (existing) {
    chooseExerciseForLog(existing.id);
    return;
  }

  try {
    let newEx = null;
    if (sbReady) {
      const res = await sbInsert('exercises', { name: clean, category });
      if (!res) throw new Error('Failed to insert exercise');
      newEx = res[0];
      exercises = await sbSelect('exercises');
    } else {
      newEx = { id: Date.now(), name: clean, category };
      ensureClientUid(newEx, 'e');
      exercises.push(newEx);
      saveAppData();
    }
    showStatus(`"${clean}" added.`, 'success');
    chooseExerciseForLog(newEx.id);
  } catch (e) {
    showStatus('Failed to add exercise: ' + (e.message || String(e)), 'error');
    console.error(e);
  }
}

function renderLogExercises() {
  const el = document.getElementById('log-exercises');
  el.innerHTML = logExercises.map((ex, i) => `
    <div class="log-entry" style="margin-bottom:12px">
      <div style="padding:14px 16px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <span style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:var(--text3)">${i+1}</span>
          <button class="btn btn-secondary" style="flex:1;justify-content:space-between;gap:12px;text-transform:none;font-family:'IBM Plex Sans',sans-serif;font-weight:600;letter-spacing:0;padding:10px 12px" onclick="openExercisePicker(${i})" title="Pick exercise">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${exerciseNameForId(ex.exercise_id) || 'Pick an exercise'}</span>
            <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text3);letter-spacing:1px;text-transform:uppercase">change</span>
          </button>
          <button onclick="removeLogExercise(${i})" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:18px;padding:4px" title="Remove">✕</button>
        </div>
        ${(!selectedMembers.length)
          ? `<div style="padding:6px 8px;color:var(--text3);font-size:12px;font-family:'IBM Plex Mono',monospace">Select who’s here above to log sets per person.</div>`
          : (ex.per_members || []).map(pm => `
            <div style="margin-top:14px;padding:12px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:6px">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">
                <div style="font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:1px;color:var(--text2);text-transform:uppercase">${memberNameForId(pm.member_id) || 'Member'}</div>
                <button class="btn btn-secondary btn-sm" onclick="addMemberSet(${i}, ${pm.member_id})">+ SET</button>
              </div>
              <div style="padding:0 4px">
                <div style="display:grid;grid-template-columns:28px 1fr 1fr 1fr auto;gap:8px;margin-bottom:6px">
                  <div></div>
                  <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text3);letter-spacing:1px">REPS</div>
                  <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text3);letter-spacing:1px">WEIGHT</div>
                  <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text3);letter-spacing:1px">UNIT</div>
                  <div></div>
                </div>
                ${(pm.sets || []).map((s, si) => `
                  <div class="set-row">
                    <div class="set-num">${si+1}</div>
                    <input type="number" placeholder="10" value="${s.reps}" min="0"
                      onchange="updateMemberSet(${i}, ${pm.member_id}, ${si}, 'reps', this.value)" style="background:var(--surface3);border-color:transparent;font-size:13px;padding:7px 10px" />
                    <input type="number" placeholder="135" value="${s.weight}" min="0"
                      onchange="updateMemberSet(${i}, ${pm.member_id}, ${si}, 'weight', this.value)" style="background:var(--surface3);border-color:transparent;font-size:13px;padding:7px 10px" />
                    <select onchange="updateMemberSet(${i}, ${pm.member_id}, ${si}, 'unit', this.value)" style="background:var(--surface3);border-color:transparent;font-size:13px;padding:7px 10px">
                      <option value="lbs" ${s.unit==='lbs'?'selected':''}>lbs</option>
                      <option value="kg" ${s.unit==='kg'?'selected':''}>kg</option>
                      <option value="bw" ${s.unit==='bw'?'selected':''}>BW</option>
                    </select>
                    <button onclick="removeMemberSet(${i}, ${pm.member_id}, ${si})" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px" title="Remove set">✕</button>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')
        }
        </div>
      </div>
    </div>
  `).join('');
}

function setLogExercise(i, val) { logExercises[i].exercise_id = val; }

function addMemberSet(exIdx, memberId) {
  const pm = (logExercises[exIdx].per_members || []).find(x => x.member_id == memberId);
  if (!pm) return;
  pm.sets.push({ reps: '', weight: '', unit: 'lbs' });
  renderLogExercises();
}

function removeMemberSet(exIdx, memberId, setIdx) {
  const pm = (logExercises[exIdx].per_members || []).find(x => x.member_id == memberId);
  if (!pm) return;
  if (pm.sets.length <= 1) return;
  pm.sets.splice(setIdx, 1);
  renderLogExercises();
}

function updateMemberSet(exIdx, memberId, setIdx, field, val) {
  const pm = (logExercises[exIdx].per_members || []).find(x => x.member_id == memberId);
  if (!pm) return;
  pm.sets[setIdx][field] = val;
}

function removeLogExercise(i) { logExercises.splice(i, 1); if (!logExercises.length) addLogExercise(); else renderLogExercises(); }

async function saveWorkoutLog() {
  const date = document.getElementById('log-date').value;
  const name = document.getElementById('log-name').value || 'Session';
  const notes = document.getElementById('log-notes').value;

  if (!date) { showStatus('Pick a date!', 'error'); return; }
  if (!selectedMembers.length) { showStatus('Select at least one member!', 'error'); return; }
  if (!logExercises.length) { showStatus('Add at least one exercise!', 'error'); return; }
  
  // Validate that exercises have sets
  const hasAnySets = logExercises.some(ex => 
    (ex.per_members || []).some(pm => (pm.sets || []).some(s => s.reps || s.weight))
  );
  if (!hasAnySets) { showStatus('Add at least one set to an exercise!', 'error'); return; }

  if (!sbReady) {
    // local only
    const id = Date.now();
    const exDetails = logExercises.map(ex => ({
      exercise_id: ex.exercise_id,
      exercise: exercises.find(e => e.id == ex.exercise_id),
      log_sets: (ex.per_members || []).flatMap(pm =>
        (pm.sets || []).map(s => ({ ...s, member_id: pm.member_id }))
      )
    }));
    const localLog = { id, date, name, notes, log_exercises: exDetails, log_members: selectedMembers.map(mid => ({ member: members.find(m => m.id === mid) })) };
    ensureClientUid(localLog, 'wl');
    workoutLogs.push(localLog);
    saveAppData();
    showStatus('Workout saved (local only — connect Supabase to persist)!', 'success');
    clearLog();
    renderDashboard();
    return;
  }

  try {
    const logData = await sbInsert('workout_logs', { date, name, notes });
    if (!logData) return;
    const logId = logData[0].id;

    // Save member associations
    for (const mid of selectedMembers) {
      await sbInsert('log_members', { log_id: logId, member_id: mid }).catch(() => {});
    }

    async function insertLogSetWithOptionalMember(payload) {
      // If the schema doesn't include log_sets.member_id, don't fail the whole save.
      const withMember = { ...payload };
      const withoutMember = { ...payload };
      delete withoutMember.member_id;

      try {
        await sbFetch('/log_sets', { method: 'POST', body: withMember, headers: { Prefer: 'return=minimal' } });
        return true;
      } catch (e1) {
        const msg = String(e1.message || '');
        if (payload.member_id != null && /member_id/i.test(msg) && /(column|schema cache|does not exist)/i.test(msg)) {
          try {
            await sbFetch('/log_sets', { method: 'POST', body: withoutMember, headers: { Prefer: 'return=minimal' } });
            return true;
          } catch (e2) {
            showStatus('DB error: ' + (e2.message || String(e2)), 'error');
            return null;
          }
        }
        showStatus('DB error: ' + (e1.message || String(e1)), 'error');
        return null;
      }
    }

    // Save exercises and sets
    for (const ex of logExercises) {
      if (!ex.exercise_id) continue;
      const exData = await sbInsert('log_exercises', { log_id: logId, exercise_id: ex.exercise_id });
      if (!exData) continue;
      const logExId = exData[0].id;
      for (const pm of (ex.per_members || [])) {
        for (const s of (pm.sets || [])) {
          if (!s.reps && !s.weight) continue;
          await insertLogSetWithOptionalMember({
            log_exercise_id: logExId,
            reps: s.reps ? parseInt(s.reps) : 0,
            weight: s.weight ? parseFloat(s.weight) : 0,
            unit: s.unit,
            member_id: pm.member_id ?? null
          });
        }
      }
    }

    workoutLogs = await sbSelect('workout_logs', '*, log_exercises(*, log_sets(*), exercise:exercises(*)), log_members(*, member:members(*))');
    showStatus('Workout saved! 💪', 'success');
    clearLog();
    renderDashboard();
    // Only push any offline cache if present; don't re-pull everything (avoid UI jump).
    syncLocalToSupabase({ refreshAfter: false }).catch(() => {});
  } catch (e) {
    showStatus('Failed to save: ' + (e.message || String(e)), 'error');
    console.error(e);
  }
}

function clearLog() {
  logExercises = [];
  selectedMembers = [];
  document.getElementById('log-name').value = '';
  document.getElementById('log-notes').value = '';
  document.getElementById('log-date').value = dayjs().format('YYYY-MM-DD');
  initLog();
}

// =====================
//   PLAN WORKOUT
// =====================
let planSlots = [];

function addPlanSlot() {
  planSlots.push({ exercise_id: exercises[0]?.id || null, sets: '', reps: '', weight: '', notes: '' });
  renderPlanSlots();
}

function addPlanSlotAndPick() {
  const idx = planSlots.length;
  addPlanSlot();
  openPlanExercisePicker(idx);
  setTimeout(() => document.getElementById('picker-new-ex-name')?.focus(), 60);
}

function renderPlanSlots() {
  const el = document.getElementById('plan-slots');
  if (!el) return;
  if (!planSlots.length) {
    el.innerHTML = '<div class="empty-state" style="padding:30px 0"><p>Click "+ ADD EXERCISE" to build your workout</p></div>';
    return;
  }
  el.innerHTML = planSlots.map((slot, i) => `
    <div class="exercise-slot">
      <div class="slot-num">${i+1}</div>
      <div class="slot-inputs" style="flex:1">
        <button class="btn btn-secondary" style="flex:1;justify-content:space-between;gap:12px;text-transform:none;font-family:'IBM Plex Sans',sans-serif;font-weight:600;letter-spacing:0;padding:10px 12px" onclick="openPlanExercisePicker(${i})" title="Pick exercise">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${exerciseNameForId(slot.exercise_id) || 'Pick an exercise'}</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text3);letter-spacing:1px;text-transform:uppercase">change</span>
        </button>
        <input type="number" placeholder="Sets" value="${slot.sets}" min="1" onchange="setPlanField(${i},'sets',this.value)" title="Sets" style="width:70px" />
        <input type="text" placeholder="Reps" value="${slot.reps}" onchange="setPlanField(${i},'reps',this.value)" title="Rep target" style="width:80px" />
        <input type="text" placeholder="Target wt" value="${slot.weight}" onchange="setPlanField(${i},'weight',this.value)" title="Target weight" style="width:90px" />
      </div>
      <button class="slot-remove" onclick="removePlanSlot(${i})" title="Remove">✕</button>
    </div>
  `).join('');
}

function setPlanExercise(i, val) { planSlots[i].exercise_id = val; }
function setPlanField(i, field, val) { planSlots[i][field] = val; }
function removePlanSlot(i) { planSlots.splice(i, 1); renderPlanSlots(); }

async function savePlan() {
  const date = document.getElementById('plan-date').value;
  const name = document.getElementById('plan-name').value || 'Planned Workout';

  if (!date) { showStatus('Set a date for this plan!', 'error'); return; }
  if (!planSlots.length) { showStatus('Add at least one exercise!', 'error'); return; }
  if (planSlots.some(s => !s.exercise_id)) { showStatus('Select an exercise for all slots!', 'error'); return; }

  if (!sbReady) {
    const id = Date.now();
    const localPlan = {
      id, date, name,
      plan_exercises: planSlots.map(s => ({
        sets: s.sets, reps: s.reps, weight: s.weight,
        exercise: exercises.find(e => e.id == s.exercise_id)
      }))
    };
    ensureClientUid(localPlan, 'wp');
    workoutPlans.push(localPlan);
    saveAppData();
    showStatus('Plan saved (local)!', 'success');
    renderSavedPlans();
    renderCalendar();
    planSlots = [];
    renderPlanSlots();
    return;
  }

  try {
    const planData = await sbInsert('workout_plans', { date, name });
    if (!planData) return;
    const planId = planData[0].id;

    let order = 0;
    for (const s of planSlots) {
      if (!s.exercise_id) continue;
      await sbInsert('plan_exercises', {
        plan_id: planId,
        exercise_id: s.exercise_id,
        target_sets: s.sets ? parseInt(s.sets) : null,
        target_reps: s.reps || null,
        target_weight: s.weight || null,
        order_index: order++
      });
    }

    workoutPlans = await sbSelect('workout_plans', '*, plan_exercises(*, exercise:exercises(*))');
    showStatus('Plan saved! 📋', 'success');
    planSlots = [];
    document.getElementById('plan-name').value = '';
    document.getElementById('plan-date').value = dayjs().add(1,'day').format('YYYY-MM-DD');
    renderPlanSlots();
    renderSavedPlans();
    renderCalendar();
    // Only push any offline cache if present; don't re-pull everything (avoid UI jump).
    syncLocalToSupabase({ refreshAfter: false }).catch(() => {});
  } catch (e) {
    showStatus('Failed to save plan: ' + (e.message || String(e)), 'error');
    console.error(e);
  }
}

function renderSavedPlans() {
  const el = document.getElementById('saved-plans-list');
  if (!el) return;
  if (!workoutPlans.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">📋</div><p>No plans saved yet.</p></div>';
    return;
  }
  const sorted = [...workoutPlans].sort((a,b) => dayjs(a.date).unix() - dayjs(b.date).unix());
  el.innerHTML = sorted.map(p => {
    const exs = (p.plan_exercises || []).sort((a,b) => (a.order_index||0)-(b.order_index||0));
    const isPast = dayjs(p.date).isBefore(dayjs(), 'day');
    const isToday = dayjs(p.date).isSame(dayjs(), 'day');
    return `
      <div class="log-entry" style="margin-bottom:10px">
        <div class="log-header">
          <div>
            <div style="display:flex;align-items:center;gap:10px">
              <div class="log-date">${dayjs(p.date).format('MMM DD, YYYY')}</div>
              ${isToday ? '<span class="badge badge-green">TODAY</span>' : ''}
              ${isPast ? '<span class="badge badge-gray">PAST</span>' : ''}
            </div>
            <div style="font-size:12px;color:var(--text2);font-family:'IBM Plex Mono',monospace;margin-top:3px">${p.name}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn btn-secondary btn-sm" onclick="loadPlanToLogDirect(${p.id})">USE NOW</button>
            <button class="btn btn-danger btn-sm" onclick="deletePlan(${p.id})">DELETE</button>
          </div>
        </div>
        <div style="padding:0 20px 14px">
          ${exs.map((e, i) => `
            <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px">
              <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--text3);width:20px">${i+1}</span>
              <span style="flex:1">${e.exercise?.name || '—'}</span>
              <span class="badge badge-gray">${e.target_sets || '—'} × ${e.target_reps || '—'}</span>
              ${e.target_weight ? `<span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--text2)">${e.target_weight}</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

async function deletePlan(id) {
  if (!confirm('Delete this plan?')) return;
  if (sbReady) {
    await sbFetch(`/plan_exercises?plan_id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }).catch(() => {});
    await sbDelete('workout_plans', id);
    workoutPlans = await sbSelect('workout_plans', '*, plan_exercises(*, exercise:exercises(*))');
  } else {
    workoutPlans = workoutPlans.filter(p => p.id !== id);
    saveAppData();
  }
  renderSavedPlans();
  renderCalendar();
  showStatus('Plan deleted.', 'success');
}


function openPlanUseModal(planId) {
  pendingPlanForLog = workoutPlans.find(p => p.id === planId) || null;
  if (!pendingPlanForLog) { showStatus('Plan not found.', 'error'); return; }
  openModal('modal-plan-use');
}

function loadPlanToLog() {
  if (!pendingPlanForLog) { showStatus('No plan selected.', 'error'); return; }
  loadPlanToLogDirect(pendingPlanForLog.id);
  pendingPlanForLog = null;
  closeModal('modal-plan-use');
}

function loadPlanToLogDirect(planId) {
  const plan = workoutPlans.find(p => p.id === planId);
  if (!plan) return;
  const exs = (plan.plan_exercises || []).sort((a,b) => (a.order_index||0)-(b.order_index||0));
  if (!selectedMembers.length && members.length) {
    selectedMembers = members.map(m => m.id);
  }
  logExercises = exs.map(e => {
    const setCount = Math.max(1, parseInt(e.target_sets) || 1);
    const reps = e.target_reps || '';
    const weight = e.target_weight || '';
    return {
      exercise_id: e.exercise_id || e.exercise?.id,
      per_members: selectedMembers.map(mid => ({
        member_id: mid,
        sets: Array.from({ length: setCount }, () => ({ reps, weight, unit: 'lbs' }))
      }))
    };
  });
  document.getElementById('log-date').value = plan.date;
  document.getElementById('log-name').value = plan.name;
  showView('log');
  initLog();
  showStatus('Plan loaded into logger!', 'success');
}

// =====================
//   NEW EXERCISE
// =====================
function toggleNewExercise() {
  const el = document.getElementById('new-exercise-inline');
  el.style.display = el.style.display === 'block' ? 'none' : 'block';
}

async function saveNewExercise() {
  const name = document.getElementById('new-ex-name').value.trim();
  const category = document.getElementById('new-ex-cat').value;
  if (!name) { showStatus('Enter exercise name!', 'error'); return; }

  try {
    let newEx;
    if (sbReady) {
      const res = await sbInsert('exercises', { name, category });
      if (!res) {
        throw new Error('Failed to insert exercise in Supabase');
      }
      newEx = res[0];
      exercises = await sbSelect('exercises');
    } else {
      newEx = { id: Date.now(), name, category };
      ensureClientUid(newEx, 'e');
      exercises.push(newEx);
      saveAppData();
    }

    document.getElementById('new-ex-name').value = '';
    document.getElementById('new-ex-cat').value = 'other';
    toggleNewExercise();
    showStatus(`"${name}" added to library! 💪`, 'success');
    // refresh plan slots selects
    renderPlanSlots();
  } catch (e) {
    showStatus('Failed to add exercise: ' + (e.message || String(e)), 'error');
    console.error(e);
  }
}

// =====================
//   HISTORY
// =====================
function renderHistory() {
  const search = (document.getElementById('history-search')?.value || '').toLowerCase();
  const el = document.getElementById('history-list');
  if (!el) return;
  const sorted = [...workoutLogs].sort((a,b) => dayjs(b.date).unix() - dayjs(a.date).unix());
  const filtered = sorted.filter(w => !search || (w.name||'').toLowerCase().includes(search) || w.date.includes(search));

  if (!filtered.length) {
    el.innerHTML = '<div class="empty-state"><div class="icon">📓</div><p>No history yet.</p></div>';
    return;
  }

  el.innerHTML = filtered.map(w => {
    const exs = (w.log_exercises || []);
    return `
      <div class="log-entry">
        <div class="log-header" onclick="this.nextElementSibling.classList.toggle('open')">
          <div>
            <div style="display:flex;align-items:center;gap:10px">
              <div class="log-date">${dayjs(w.date).format('ddd MMM DD, YYYY')}</div>
            </div>
            <div style="font-size:12px;color:var(--text2);font-family:'IBM Plex Mono',monospace;margin-top:3px">${w.name || 'Session'}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            ${exs.length ? `<span class="badge badge-yellow">${exs.length} ex</span>` : ''}
            <span style="color:var(--text3);font-size:18px">▾</span>
          </div>
        </div>
        <div class="log-body">
          ${exs.map(e => {
            const sets = e.log_sets || [];
            const byMember = sets.reduce((acc, s) => {
              const key = s.member_id != null ? String(s.member_id) : '';
              (acc[key] ||= []).push(s);
              return acc;
            }, {});
            const memberKeys = Object.keys(byMember);
            return `
              <div style="padding:10px 0;border-bottom:1px solid var(--border)">
                <div style="font-weight:600;margin-bottom:6px">${e.exercise?.name || '—'}</div>
                ${!sets.length ? '<span style="color:var(--text3);font-size:12px">No sets recorded</span>' : `
                  <div style="display:flex;flex-direction:column;gap:8px">
                    ${memberKeys.map(k => {
                      const who = memberNameForId(k);
                      const label = who || 'Unassigned';
                      const mSets = byMember[k] || [];
                      return `
                        <div>
                          <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--text3);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">${label}</div>
                          <div style="display:flex;flex-wrap:wrap;gap:6px">
                            ${mSets.map((s, si) => `<span class="badge badge-gray">Set ${si+1}: ${s.reps || '?'} reps × ${s.weight || '?'} ${s.unit||'lbs'}</span>`).join('')}
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                `}
              </div>
            `;
          }).join('')}
          ${w.notes ? `<div style="margin-top:10px;font-size:12px;color:var(--text2);font-family:'IBM Plex Mono',monospace;padding:10px;background:var(--surface2);border-radius:4px">${w.notes}</div>` : ''}
          ${!exs.length ? '<p style="color:var(--text3);font-size:13px;padding:10px 0">No exercises recorded.</p>' : ''}
        </div>
      </div>
    `;
  }).join('');
}

function filterHistory() { renderHistory(); }

// =====================
//   MEMBERS
// =====================
function renderMembers() {
  const el = document.getElementById('members-grid');
  if (!el) return;
  if (!members.length) {
    el.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="icon">👥</div><p>Add your gym crew.</p></div>';
    return;
  }
  el.innerHTML = members.map(m => {
    const sessions = workoutLogs.filter(w =>
      (w.log_members || []).some(lm => lm.member_id === m.id || lm.member?.id === m.id)
    ).length;
    return `
      <div class="card" style="position:relative">
        <button onclick="deleteMember(${m.id})" style="position:absolute;top:10px;right:10px;background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px" title="Remove">✕</button>
        <div style="font-family:'Bebas Neue',sans-serif;font-size:48px;color:var(--accent);line-height:1">${m.name[0].toUpperCase()}</div>
        <div style="font-size:16px;font-weight:600;margin-top:4px">${m.name}</div>
        ${m.tag ? `<div style="margin-top:4px"><span class="badge badge-blue">${m.tag}</span></div>` : ''}
        <div style="margin-top:12px;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--text3)">${sessions} sessions logged</div>
      </div>
    `;
  }).join('');
}

async function saveMember() {
  const name = document.getElementById('member-name').value.trim();
  const tag = document.getElementById('member-tag').value.trim();
  if (!name) { showStatus('Enter a name!', 'error'); return; }

  try {
    if (sbReady) {
      // Prevent duplicates across devices: treat "same name" (case-insensitive) as the same member.
      const existing = await sbFetch(`/members?select=id,name,tag,client_uid&name=ilike.${encodeURIComponent(name)}&limit=1`, { method: 'GET' }).catch(() => []);
      if (existing && existing.length) {
        const found = existing[0];
        if (tag && !found.tag) {
          await sbUpdate('members', found.id, { tag }).catch(() => {});
        }
        members = await sbSelect('members');
        closeModal('modal-add-member');
        document.getElementById('member-name').value = '';
        document.getElementById('member-tag').value = '';
        renderMembers();
        initLog();
        showStatus(`${found.name} already exists — selected existing.`, 'success');
        return;
      }

      const res = await sbInsert('members', { name, tag: tag || null });
      if (!res) {
        // Supabase insert can fail (RLS/offline). Save locally so the user doesn't lose data.
        const alreadyLocal = members.find(m => normalizeName(m.name) === normalizeName(name));
        if (alreadyLocal) {
          closeModal('modal-add-member');
          document.getElementById('member-name').value = '';
          document.getElementById('member-tag').value = '';
          renderMembers();
          initLog();
          showStatus(`${alreadyLocal.name} already exists locally.`, 'success');
          return;
        }
        const localMember = { id: Date.now(), name, tag };
        ensureClientUid(localMember, 'm');
        members.push(localMember);
        saveAppData(true);
        closeModal('modal-add-member');
        document.getElementById('member-name').value = '';
        document.getElementById('member-tag').value = '';
        renderMembers();
        initLog();
        showStatus(`${name} saved locally — will sync when Supabase allows writes.`, 'success');
        return;
      }
      members = await sbSelect('members');
    } else {
      const alreadyLocal = members.find(m => normalizeName(m.name) === normalizeName(name));
      if (alreadyLocal) {
        closeModal('modal-add-member');
        document.getElementById('member-name').value = '';
        document.getElementById('member-tag').value = '';
        renderMembers();
        initLog();
        showStatus(`${alreadyLocal.name} already exists.`, 'success');
        return;
      }
      const localMember = { id: Date.now(), name, tag };
      ensureClientUid(localMember, 'm');
      members.push(localMember);
      saveAppData();
    }

    closeModal('modal-add-member');
    document.getElementById('member-name').value = '';
    document.getElementById('member-tag').value = '';
    renderMembers();
    initLog();
    showStatus(`${name} added! 👥`, 'success');
  } catch (e) {
    showStatus('Failed to add member: ' + (e.message || String(e)), 'error');
    console.error(e);
  }
}

async function deleteMember(id) {
  if (!confirm('Remove this member?')) return;
  if (sbReady) {
    await sbDelete('members', id);
    // If delete failed (RLS), still allow local delete so UI matches user intent.
    members = members.filter(m => m.id !== id);
    saveAppData(true);
    const refreshed = await sbSelect('members');
    if (refreshed.length) members = refreshed;
  } else {
    members = members.filter(m => m.id !== id);
    saveAppData();
  }
  renderMembers();
  initLog();
}

// =====================
//   LOG DETAIL
// =====================
function openLogDetail(id) {
  const w = workoutLogs.find(w => w.id === id);
  if (!w) return;
  document.getElementById('log-detail-title').textContent = (w.name || 'SESSION') + ' — ' + dayjs(w.date).format('MMM DD, YYYY').toUpperCase();
  const exs = w.log_exercises || [];
  document.getElementById('log-detail-body').innerHTML = `
    ${exs.map(e => {
      const sets = e.log_sets || [];
      return `
        <div style="margin-bottom:16px">
          <div style="font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:1px;margin-bottom:8px">${e.exercise?.name || '—'}</div>
          <table style="width:100%">
            <tr><th>SET</th><th>REPS</th><th>WEIGHT</th><th>UNIT</th><th>WHO</th></tr>
            ${sets.map((s,i) => `<tr><td>${i+1}</td><td>${s.reps||'—'}</td><td>${s.weight||'—'}</td><td>${s.unit||'lbs'}</td><td>${memberNameForId(s.member_id) || '—'}</td></tr>`).join('')}
          </table>
        </div>
      `;
    }).join('')}
    ${w.notes ? `<div style="margin-top:12px;padding:12px;background:var(--surface2);border-radius:4px;font-size:13px;color:var(--text2)">${w.notes}</div>` : ''}
  `;
  openModal('modal-log-detail');
}

// =====================
//   MODALS & UTILS
// =====================
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => {
    if (e.target === o) o.classList.remove('open');
  });
});

let statusTimer;
function showStatus(msg, type = '') {
  const el = document.getElementById('status-bar');
  el.textContent = msg;
  el.className = type;
  el.style.display = 'block';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { el.style.display = 'none'; }, 3500);
}

// =====================
//   PIN GATE - DISABLED
// =====================
// PIN gate has been removed for full access.
// Uncomment code below if you want to re-enable it.

/*
const PIN_STORAGE_KEY = 'ironlog_pin_ok_v1';

function isUnlocked() {
  try { return localStorage.getItem(PIN_STORAGE_KEY) === '1'; } catch { return false; }
}

function setUnlocked(v) {
  try { localStorage.setItem(PIN_STORAGE_KEY, v ? '1' : '0'); } catch {}
}

function enforcePinGate() {
  const locked = !isUnlocked();
  document.body.classList.toggle('locked', locked);
  const overlay = document.getElementById('modal-pin');
  if (!overlay) return;
  if (locked) {
    overlay.classList.add('open');
    setTimeout(() => document.getElementById('pin-input')?.focus(), 50);
  } else {
    overlay.classList.remove('open');
  }
}

function submitPin() {
  const input = document.getElementById('pin-input');
  const err = document.getElementById('pin-error');
  const val = (input?.value || '').trim();
  if (!val) { if (err) err.textContent = 'Enter a PIN.'; return; }
  if (val !== String(APP_PIN)) {
    if (err) err.textContent = 'Wrong PIN.';
    if (input) input.value = '';
    return;
  }
  if (err) err.textContent = '';
  setUnlocked(true);
  enforcePinGate();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('modal-pin')?.classList.contains('open')) submitPin();
});
*/

async function refreshApp() {
  // Helpful for iOS/Android homescreen installs where browser UI is hidden.
  // If Supabase is connected, try syncing first; always fall back to reloading.
  const doReload = () => { try { location.reload(); } catch {} };

  if (!sbReady) { doReload(); return; }

  try {
    const timeoutMs = 4000;
    await Promise.race([
      syncLocalToSupabase(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('sync timeout')), timeoutMs))
    ]);
    doReload();
  } catch (e) {
    // Sync can fail (missing SQL migration, offline, RLS). Don't block refresh.
    showStatus('Sync skipped/failed — refreshing anyway.', 'error');
    setTimeout(doReload, 350);
  }
}

// =====================
//   TIMERS
// =====================
const TIMER_STORAGE_KEY = 'ironlog_timers_v1';
const APP_STORAGE_KEY = 'ironlog_appdata_v1';
const DEVICE_STORAGE_KEY = 'ironlog_device_v1';
const SYNC_STORAGE_KEY = 'ironlog_sync_v1';

let restTimer = { durationSec: 90, running: false, endAt: null };
let workoutTimer = { elapsedMs: 0, running: false, startAt: null };
let notificationsEnabled = false;
let timerIntervalId = null;

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function formatClock(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function getRestRemainingSec() {
  if (!restTimer.running || !restTimer.endAt) return restTimer.durationSec;
  return Math.ceil((restTimer.endAt - Date.now()) / 1000);
}

function getWorkoutElapsedMs() {
  if (!workoutTimer.running || !workoutTimer.startAt) return workoutTimer.elapsedMs;
  return workoutTimer.elapsedMs + (Date.now() - workoutTimer.startAt);
}

function saveTimers() {
  try {
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify({ restTimer, workoutTimer, notificationsEnabled }));
  } catch {}
}

function loadTimers() {
  try {
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed?.restTimer) restTimer = { ...restTimer, ...parsed.restTimer };
    if (parsed?.workoutTimer) workoutTimer = { ...workoutTimer, ...parsed.workoutTimer };
    if (typeof parsed?.notificationsEnabled === 'boolean') notificationsEnabled = parsed.notificationsEnabled;
  } catch {}
}

function saveAppData(force = false) {
  if (sbReady && !force) return; // Supabase is source of truth when connected
  try {
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify({
      members,
      exercises,
      workoutLogs,
      workoutPlans
    }));
  } catch {}
}

function loadAppData() {
  // Always allow reading local cache (used for offline→cloud sync too)
  try {
    const raw = localStorage.getItem(APP_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.members)) members = parsed.members;
    if (Array.isArray(parsed?.exercises)) exercises = parsed.exercises;
    if (Array.isArray(parsed?.workoutLogs)) workoutLogs = parsed.workoutLogs;
    if (Array.isArray(parsed?.workoutPlans)) workoutPlans = parsed.workoutPlans;

    // Backfill client_uids for older cached data
    members.forEach(m => ensureClientUid(m, 'm'));
    exercises.forEach(e => ensureClientUid(e, 'e'));
    workoutLogs.forEach(w => ensureClientUid(w, 'wl'));
    workoutPlans.forEach(p => ensureClientUid(p, 'wp'));
  } catch {}
}

function getDeviceId() {
  try {
    const raw = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id) return parsed.id;
    }
  } catch {}

  const id = (crypto?.randomUUID?.() || `dev_${Math.random().toString(16).slice(2)}_${Date.now()}`);
  try { localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify({ id })); } catch {}
  return id;
}

function ensureClientUid(obj, prefix) {
  if (!obj) return null;
  if (obj.client_uid) return obj.client_uid;
  const deviceId = getDeviceId();
  const uid = (crypto?.randomUUID?.() || `${prefix}_${deviceId}_${Math.random().toString(16).slice(2)}_${Date.now()}`);
  obj.client_uid = `${prefix}_${uid}`;
  return obj.client_uid;
}

function getSyncState() {
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setSyncState(next) {
  try { localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(next || {})); } catch {}
}

function notificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'denied' | 'granted'
}

function canNotifyNow() {
  return notificationsEnabled && notificationPermission() === 'granted';
}

function updateNotificationUI() {
  const statusEl = document.getElementById('notif-status');
  const btnEl = document.getElementById('notif-btn');
  if (!statusEl || !btnEl) return;

  const perm = notificationPermission();
  if (perm === 'unsupported') {
    statusEl.textContent = 'Not supported in this browser.';
    btnEl.disabled = true;
    return;
  }

  if (perm === 'denied') {
    statusEl.textContent = 'Blocked in browser settings.';
    btnEl.disabled = true;
    return;
  }

  btnEl.disabled = false;
  if (perm === 'granted') statusEl.textContent = notificationsEnabled ? 'Enabled.' : 'Permission granted (disabled).';
  else statusEl.textContent = 'Not enabled yet.';
}

async function requestNotifications() {
  if (!('Notification' in window)) { showStatus('Notifications not supported in this browser.', 'error'); return; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    notificationsEnabled = false;
    showStatus('Notifications not enabled.', 'error');
  } else {
    notificationsEnabled = true;
    showStatus('Notifications enabled.', 'success');
  }
  saveTimers();
  updateNotificationUI();
}

function disableNotifications() {
  notificationsEnabled = false;
  saveTimers();
  updateNotificationUI();
  showStatus('Notifications disabled.', 'success');
}

function sendNotification(title, body) {
  if (!canNotifyNow()) return;
  try {
    new Notification(title, { body, silent: false });
  } catch {}
}

function sendTestNotification() {
  if (!('Notification' in window)) { showStatus('Notifications not supported in this browser.', 'error'); return; }
  if (notificationPermission() !== 'granted') { showStatus('Enable notifications first.', 'error'); return; }
  notificationsEnabled = true;
  saveTimers();
  updateNotificationUI();
  sendNotification('IRON LOG', 'Test notification.');
}

function beep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, 180);
  } catch {}
}

function ensureTimerLoop() {
  if (timerIntervalId) return;
  timerIntervalId = setInterval(() => {
    // Rest timer expiry
    if (restTimer.running && restTimer.endAt) {
      const remaining = getRestRemainingSec();
      if (remaining <= 0) {
        restTimer.running = false;
        restTimer.endAt = null;
        beep();
        sendNotification('Rest complete', 'Time to start your next set.');
        try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch {}
        showStatus('Rest over. Go time.', 'success');
      }
    }

    // Stop loop if nothing running
    if (!restTimer.running && !workoutTimer.running) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }

    updateTimerUI();
    saveTimers();
  }, 250);
}

function updateTimerUI() {
  const restEl = document.getElementById('rest-time');
  const restToggleBtn = document.getElementById('rest-toggle-btn');
  const workoutEl = document.getElementById('workout-time');
  const workoutToggleBtn = document.getElementById('workout-toggle-btn');
  const headerTimer = document.getElementById('header-timer');

  if (restEl) restEl.textContent = formatClock(getRestRemainingSec());
  if (restToggleBtn) restToggleBtn.textContent = restTimer.running ? 'PAUSE' : 'START';

  if (workoutEl) workoutEl.textContent = formatClock(Math.floor(getWorkoutElapsedMs() / 1000));
  if (workoutToggleBtn) workoutToggleBtn.textContent = workoutTimer.running ? 'PAUSE' : 'START';

  if (headerTimer) {
    if (restTimer.running) headerTimer.textContent = `⏱ REST · ${formatClock(getRestRemainingSec())}`;
    else if (workoutTimer.running) headerTimer.textContent = `⏱ WORKOUT · ${formatClock(Math.floor(getWorkoutElapsedMs() / 1000))}`;
    else headerTimer.textContent = '⏱ TIMERS';
  }

  updateNotificationUI();
  updateSupabaseStatusUI();
}

function updateSupabaseStatusUI() {
  const el = document.getElementById('sb-status');
  if (!el) return;
  const mode = sbReady ? 'CONNECTED' : 'OFFLINE';
  const urlShort = (SUPABASE_URL || '').replace(/^https?:\/\//, '');
  const source = lastSupabaseSourceTried ? ` · JS: ${lastSupabaseSourceTried}` : '';
  const err = (!sbReady && lastSupabaseLoadError) ? `\n${lastSupabaseLoadError}` : '';
  const proto = location.protocol ? ` · Origin: ${location.protocol}//` : '';
  el.textContent = `Status: ${mode} · Project: ${urlShort || '—'}${proto}${source}${err}`;
}

async function testSupabase() {
  if (!sbReady) { showStatus('Supabase not connected.', 'error'); return; }
  try {
    // Try select
    await sbFetch('/members?select=id&limit=1', { method: 'GET' });
    // Try insert (will fail under RLS without policies)
    const testName = 'DB_TEST_' + dayjs().format('HHmmss');
    const ins = await sbFetch('/members?select=*', { method: 'POST', body: { name: testName, tag: 'temp' }, headers: { Prefer: 'return=representation' } });
    const newId = ins?.[0]?.id;
    showStatus(`Supabase OK. Inserted test member id=${newId || '—'}.`, 'success');
  } catch (e) {
    const msg = e?.message || String(e);
    lastDbError = msg;
    showStatus('Supabase test failed: ' + msg, 'error');
    console.error(e);
  }
  updateSupabaseStatusUI();
}

async function copyLastDbError() {
  const text = lastDbError || 'No DB error recorded yet.';
  try {
    await navigator.clipboard.writeText(text);
    showStatus('Copied.', 'success');
  } catch {
    showStatus(text, 'error');
  }
}

function setRestPreset(sec) {
  const s = clamp(Number(sec) || 0, 5, 60 * 60);
  restTimer.durationSec = s;
  if (restTimer.running) restTimer.endAt = Date.now() + s * 1000;
  updateTimerUI();
  saveTimers();
}

function applyRestCustom() {
  const val = Number(document.getElementById('rest-custom-seconds')?.value);
  if (!val || val < 5) { showStatus('Enter at least 5 seconds.', 'error'); return; }
  setRestPreset(val);
}

function toggleRestTimer() {
  if (restTimer.running) {
    restTimer.durationSec = clamp(getRestRemainingSec(), 0, 60 * 60);
    restTimer.running = false;
    restTimer.endAt = null;
  } else {
    const s = clamp(restTimer.durationSec || 90, 5, 60 * 60);
    restTimer.running = true;
    restTimer.endAt = Date.now() + s * 1000;
    ensureTimerLoop();
  }
  updateTimerUI();
  saveTimers();
}

function refreshRestTimer() {
  // Restart the countdown using the current configured duration.
  const s = clamp(restTimer.durationSec || 90, 5, 60 * 60);
  restTimer.running = true;
  restTimer.endAt = Date.now() + s * 1000;
  ensureTimerLoop();
  updateTimerUI();
  saveTimers();
}

function resetRestTimer() {
  restTimer.running = false;
  restTimer.endAt = null;
  updateTimerUI();
  saveTimers();
}

function addRestSeconds(delta) {
  const d = Number(delta) || 0;
  const next = clamp(restTimer.durationSec + d, 0, 60 * 60);
  restTimer.durationSec = next;
  if (restTimer.running) restTimer.endAt = Date.now() + next * 1000;
  updateTimerUI();
  saveTimers();
}

function toggleWorkoutTimer() {
  if (workoutTimer.running) {
    workoutTimer.elapsedMs = getWorkoutElapsedMs();
    workoutTimer.running = false;
    workoutTimer.startAt = null;
  } else {
    workoutTimer.running = true;
    workoutTimer.startAt = Date.now();
    ensureTimerLoop();
  }
  updateTimerUI();
  saveTimers();
}

function resetWorkoutTimer() {
  workoutTimer.elapsedMs = 0;
  workoutTimer.running = false;
  workoutTimer.startAt = null;
  updateTimerUI();
  saveTimers();
}

function toggleQuickTimer() {
  // Deprecated (kept for backwards compatibility if referenced somewhere)
  if (restTimer.running) toggleRestTimer(); else toggleWorkoutTimer();
}

// =====================
//   OFFLINE → SUPABASE SYNC
// =====================
async function syncLocalToSupabase({ refreshAfter = true } = {}) {
  if (!sbReady) return;

  // Pull any offline cache (even while connected) so we can upload it.
  loadAppData();

  const hasLocal = (members?.length || exercises?.length || workoutLogs?.length || workoutPlans?.length);
  if (!hasLocal) return;

  showStatus('Syncing local data to Supabase...', 'success');

  // Ensure client_uids exist
  members.forEach(m => ensureClientUid(m, 'm'));
  exercises.forEach(e => ensureClientUid(e, 'e'));
  workoutLogs.forEach(w => ensureClientUid(w, 'wl'));
  workoutPlans.forEach(p => ensureClientUid(p, 'wp'));
  saveAppData(true);

  // Prevent duplicate rows across devices by "adopting" existing remote rows with the same name.
  // This keeps a stable id on Supabase and avoids creating a second row when client_uid differs.
  const remoteMembersAll = await sbSelect('members', 'id,name,tag,client_uid');
  const remoteExercisesAll = await sbSelect('exercises', 'id,name,category,client_uid');

  const remoteMemberByName = new Map();
  for (const rm of remoteMembersAll) {
    const key = normalizeName(rm?.name);
    if (key && !remoteMemberByName.has(key)) remoteMemberByName.set(key, rm);
  }
  const remoteMemberByUid = new Map(remoteMembersAll.filter(r => r?.client_uid).map(r => [r.client_uid, r]));

  const remoteExerciseByName = new Map();
  for (const re of remoteExercisesAll) {
    const key = normalizeName(re?.name);
    if (key && !remoteExerciseByName.has(key)) remoteExerciseByName.set(key, re);
  }
  const remoteExerciseByUid = new Map(remoteExercisesAll.filter(r => r?.client_uid).map(r => [r.client_uid, r]));

  for (const m of members) {
    const key = normalizeName(m?.name);
    const rm = key ? remoteMemberByName.get(key) : null;
    if (!rm) continue;
    if (rm.client_uid) {
      m.client_uid = rm.client_uid;
    } else if (m.client_uid) {
      // Only set remote client_uid if it won't collide with another remote row.
      if (!remoteMemberByUid.has(m.client_uid)) {
        await sbUpdate('members', rm.id, { client_uid: m.client_uid }).catch(() => {});
        rm.client_uid = m.client_uid;
        remoteMemberByUid.set(m.client_uid, rm);
      } else {
        // Another row already owns this uid; adopt that uid locally instead.
        const owner = remoteMemberByUid.get(m.client_uid);
        if (owner?.client_uid) m.client_uid = owner.client_uid;
      }
    }
  }

  for (const e of exercises) {
    const key = normalizeName(e?.name);
    const re = key ? remoteExerciseByName.get(key) : null;
    if (!re) continue;
    if (re.client_uid) {
      e.client_uid = re.client_uid;
    } else if (e.client_uid) {
      if (!remoteExerciseByUid.has(e.client_uid)) {
        await sbUpdate('exercises', re.id, { client_uid: e.client_uid }).catch(() => {});
        re.client_uid = e.client_uid;
        remoteExerciseByUid.set(e.client_uid, re);
      } else {
        const owner = remoteExerciseByUid.get(e.client_uid);
        if (owner?.client_uid) e.client_uid = owner.client_uid;
      }
    }
  }

  // De-dupe local arrays by client_uid so we don't upsert duplicates.
  const uniqByUid = (arr) => {
    const seen = new Map();
    for (const item of arr) {
      const uid = item?.client_uid;
      if (!uid) continue;
      if (!seen.has(uid)) seen.set(uid, item);
    }
    return Array.from(seen.values());
  };
  members = uniqByUid(members);
  exercises = uniqByUid(exercises);

  // Helper: attempt an upsert and detect missing client_uid columns.
  async function upsertByClientUid(table, rows) {
    if (!rows.length) return [];
    // Extra guard: avoid sending duplicate client_uids in one request (can trigger unique violations).
    const uniq = [];
    const seen = new Set();
    for (const r of rows) {
      const uid = r?.client_uid;
      if (!uid) continue;
      if (seen.has(uid)) continue;
      seen.add(uid);
      uniq.push(r);
    }
    try {
      const data = await sbFetch(`/${table}?on_conflict=client_uid&select=*`, {
        method: 'POST',
        body: uniq,
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' }
      });
      return data || [];
    } catch (error) {
      const msg = String(error.message || '');
      if (/client_uid/i.test(msg) && /(column|schema cache|on conflict)/i.test(msg)) {
        showStatus(`Supabase needs a client_uid column on ${table}. Run the SQL migration.`, 'error');
      } else if (/duplicate key value violates unique constraint/i.test(msg) && /client_uid/i.test(msg)) {
        showStatus(`DB error: duplicate client_uid while syncing ${table}. Try refresh; if it persists, clear site storage on one device.`, 'error');
      } else {
        showStatus('DB error: ' + msg, 'error');
      }
      throw error;
    }
  }

  // Upsert members/exercises first so we can map ids
  const remoteMembers = await upsertByClientUid('members', members.map(m => ({ client_uid: m.client_uid, name: m.name, tag: m.tag || null })));
  const remoteExercises = await upsertByClientUid('exercises', exercises.map(e => ({ client_uid: e.client_uid, name: e.name, category: e.category || 'other' })));

  const memberIdByUid = new Map(remoteMembers.map(m => [m.client_uid, m.id]));
  const exerciseIdByUid = new Map(remoteExercises.map(e => [e.client_uid, e.id]));

  // Also allow name-based mapping fallback (for existing rows without client_uid)
  remoteMembers.forEach(m => { if (m?.name) memberIdByUid.set(`name:${m.name.toLowerCase()}`, m.id); });
  remoteExercises.forEach(e => { if (e?.name) exerciseIdByUid.set(`name:${e.name.toLowerCase()}`, e.id); });

  async function insertLogSetWithOptionalMember(payload) {
    const withMember = { ...payload };
    const withoutMember = { ...payload };
    delete withoutMember.member_id;
    try {
      await sbFetch('/log_sets', { method: 'POST', body: withMember, headers: { Prefer: 'return=minimal' } });
      return true;
    } catch (e1) {
      const msg = String(e1.message || '');
      if (payload.member_id != null && /member_id/i.test(msg) && /(column|schema cache|does not exist)/i.test(msg)) {
        await sbFetch('/log_sets', { method: 'POST', body: withoutMember, headers: { Prefer: 'return=minimal' } });
        return true;
      }
      throw e1;
    }
  }

  // Sync workout logs (treat each log as atomic; skip if already exists)
  for (const w of workoutLogs) {
    if (!w?.date) continue;
    ensureClientUid(w, 'wl');

    let existing = [];
    try {
      existing = await sbFetch(`/workout_logs?select=id&client_uid=eq.${encodeURIComponent(w.client_uid)}&limit=1`, { method: 'GET' });
    } catch (exErr) {
      const msg = String(exErr.message || '');
      if (/client_uid/i.test(msg) && /(column|schema cache)/i.test(msg)) {
        showStatus('Supabase needs client_uid on workout_logs. Run the SQL migration.', 'error');
      }
      throw exErr;
    }
    if (existing && existing.length) continue;

    const insertedLogs = await sbFetch('/workout_logs?select=*', {
      method: 'POST',
      body: {
        client_uid: w.client_uid,
        date: w.date,
        name: w.name || null,
        notes: w.notes || null
      },
      headers: { Prefer: 'return=representation' }
    });
    const logId = insertedLogs?.[0]?.id;
    if (!logId) continue;

    // Members present
    const localMemberIds = (w.log_members || []).map(lm => lm.member_id || lm.member?.id).filter(Boolean);
    for (const localMid of localMemberIds) {
      const localM = members.find(mm => mm.id == localMid);
      let memberId = localM?.client_uid ? (memberIdByUid.get(localM.client_uid) || null) : null;
      if (!memberId && localM?.name) memberId = memberIdByUid.get(`name:${localM.name.toLowerCase()}`) || null;
      if (!memberId) continue;
      await sbFetch('/log_members', { method: 'POST', body: { log_id: logId, member_id: memberId }, headers: { Prefer: 'return=minimal' } });
    }

    // Exercises + sets
    for (const ex of (w.log_exercises || [])) {
      const localExerciseId = ex.exercise_id || ex.exercise?.id;
      const localEx = exercises.find(ee => ee.id == localExerciseId) || ex.exercise;
      let exerciseId = null;
      if (localEx?.client_uid) exerciseId = exerciseIdByUid.get(localEx.client_uid);
      if (!exerciseId && localEx?.name) exerciseId = exerciseIdByUid.get(`name:${localEx.name.toLowerCase()}`);
      if (!exerciseId) continue;

      const exRows = await sbFetch('/log_exercises?select=*', {
        method: 'POST',
        body: { log_id: logId, exercise_id: exerciseId },
        headers: { Prefer: 'return=representation' }
      });
      const logExerciseId = exRows?.[0]?.id;
      if (!logExerciseId) continue;

      for (const s of (ex.log_sets || [])) {
        if (!s.reps && !s.weight) continue;
        // Set owner
        let setMemberId = null;
        if (s.member_id != null) {
          const localM = members.find(mm => mm.id == s.member_id) || (typeof s.member_id === 'string' ? members.find(mm => mm.client_uid === s.member_id) : null);
          if (localM?.client_uid) setMemberId = memberIdByUid.get(localM.client_uid) || null;
          if (!setMemberId && localM?.name) setMemberId = memberIdByUid.get(`name:${localM.name.toLowerCase()}`) || null;
        }
        await insertLogSetWithOptionalMember({
          log_exercise_id: logExerciseId,
          reps: s.reps || 0,
          weight: s.weight || 0,
          unit: s.unit || 'lbs',
          member_id: setMemberId
        });
      }
    }
  }

  // Sync workout plans (atomic; skip if already exists)
  for (const p of workoutPlans) {
    if (!p?.date) continue;
    ensureClientUid(p, 'wp');

    let existing = [];
    try {
      existing = await sbFetch(`/workout_plans?select=id&client_uid=eq.${encodeURIComponent(p.client_uid)}&limit=1`, { method: 'GET' });
    } catch (exErr) {
      const msg = String(exErr.message || '');
      if (/client_uid/i.test(msg) && /(column|schema cache)/i.test(msg)) {
        showStatus('Supabase needs client_uid on workout_plans. Run the SQL migration.', 'error');
      }
      throw exErr;
    }
    if (existing && existing.length) continue;

    const insertedPlans = await sbFetch('/workout_plans?select=*', {
      method: 'POST',
      body: {
        client_uid: p.client_uid,
        date: p.date,
        name: p.name || null
      },
      headers: { Prefer: 'return=representation' }
    });
    const planId = insertedPlans?.[0]?.id;
    if (!planId) continue;

    const exs = (p.plan_exercises || []);
    let order = 0;
    for (const pe of exs) {
      const localExerciseId = pe.exercise_id || pe.exercise?.id;
      const localEx = exercises.find(ee => ee.id == localExerciseId) || pe.exercise;
      let exerciseId = null;
      if (localEx?.client_uid) exerciseId = exerciseIdByUid.get(localEx.client_uid);
      if (!exerciseId && localEx?.name) exerciseId = exerciseIdByUid.get(`name:${localEx.name.toLowerCase()}`);
      if (!exerciseId) continue;

      await sbFetch('/plan_exercises', { method: 'POST', body: {
        plan_id: planId,
        exercise_id: exerciseId,
        target_sets: pe.sets ?? pe.target_sets ?? null,
        target_reps: pe.reps ?? pe.target_reps ?? null,
        target_weight: pe.weight ?? pe.target_weight ?? null,
        order_index: pe.order_index ?? order++
      }, headers: { Prefer: 'return=minimal' } });
    }
  }

  // Finally refresh local UI from Supabase (optional)
  if (refreshAfter) {
    await loadAll();
  }
  showStatus('Sync complete.', 'success');
}

// =====================
//   INIT
// =====================
window.addEventListener('load', () => {
  // PIN gate disabled - full access enabled
  // enforcePinGate();

  const pageView = document.body?.dataset?.view;
  if (pageView) {
    setNavActive(pageView);
    const viewEl = document.getElementById('view-' + pageView);
    if (viewEl) {
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      viewEl.classList.add('active');
    }
  }

  // Set default dates
  const today = dayjs().format('YYYY-MM-DD');
  const tomorrow = dayjs().add(1,'day').format('YYYY-MM-DD');
  const logDateEl = document.getElementById('log-date');
  if (logDateEl) logDateEl.value = today;
  const planDateEl = document.getElementById('plan-date');
  if (planDateEl) planDateEl.value = tomorrow;

  // If embedded Supabase credentials are present, connect automatically.
  if (SUPABASE_URL.trim() && SUPABASE_ANON_KEY.trim()) {
    autoInitSupabase();
  } else {
    // Load without Supabase (demo mode)
    loadAppData();
    // Don't auto-seed exercises
    if (planDateEl) {
      addPlanSlot(); // start with one slot (plan page only)
      renderPlanSlots();
    }
    renderDashboard();
    renderCalendar();
    initLog();
    renderSavedPlans();
    renderMembers();
  }

  loadTimers();
  // If timers were running, keep them running after reload.
  if (restTimer.running && restTimer.endAt && restTimer.endAt > Date.now()) ensureTimerLoop();
  else if (restTimer.running) { restTimer.running = false; restTimer.endAt = null; }
  if (workoutTimer.running) ensureTimerLoop();
  updateTimerUI();
  updateNotificationUI();
});

// Supabase SQL schema info on load
console.log(`
✓ IRON LOG Setup Instructions:

1. Create a Supabase project at https://supabase.com
2. Find your Anon Public Key and Project URL in your Supabase dashboard
3. Copy the entire contents of supabase_schema.sql
4. Paste and run it in your Supabase SQL Editor (Database → SQL Editor)
5. Update SUPABASE_URL and SUPABASE_ANON_KEY in assets/app.js

The schema includes:
- All necessary tables (members, exercises, workout_logs, etc.)
- Proper foreign keys and constraints
- Row Level Security policies
- Default exercises
- client_uid columns for offline→cloud sync

Questions? Check the schema file for detailed comments.
`);
