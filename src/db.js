import { sb } from './supabase.js';
import { S } from './state.js';
import { SHIFTS, WEEKEND_SHIFTS } from './config.js';
import { getWeekDates } from './utils.js';

// ══════════════════════════════════════════════════════
// DATA LOADING
// ══════════════════════════════════════════════════════

export function isManager() {
  if (S.testAsEmployee) return false;
  return S.profile?.role === 'admin' || S.profile?.role === 'manager';
}

export function isAdmin() {
  return S.profile?.role === 'admin';
}

export function getActiveEmpId() {
  return (S.testAsEmployee && S.empViewId) ? S.empViewId : S.user?.id;
}

export function getActiveProfile() {
  if (S.testAsEmployee && S.empViewId) {
    return S.employees.find(e => e.id === S.empViewId) || S.profile;
  }
  return S.profile;
}

export async function loadInvitations() {
  if (!S.profile?.business_id || !isManager()) return;
  const { data } = await sb.from('invitations')
    .select('*')
    .eq('business_id', S.profile.business_id)
    .order('created_at', { ascending: false });
  S.invitations = data || [];
}

export async function loadEmployees() {
  if (!S.profile?.business_id) return;
  const { data } = await sb.from('profiles')
    .select('*').eq('business_id', S.profile.business_id)
    .eq('is_deleted', false).order('name');
  S.employees = (data || []).map(emp => {
    emp.name = emp.name || 'עובד ללא שם';
    return emp;
  });
}

export async function loadVacations() {
  if (!S.profile?.business_id) return;
  const { data } = await sb.from('vacations').select('*').eq('business_id', S.profile.business_id);
  S.vacations = data || [];
}

export async function loadAvailSubmissions() {
  if (!S.profile?.business_id) return;
  const { data } = await sb.from('availability_submissions').select('*')
    .eq('business_id', S.profile.business_id).order('created_at', { ascending: false });
  S.availSubmissions = data || [];
}

export async function loadSwapRequests() {
  if (!S.profile?.business_id) return;
  const { data: d1 } = await sb.from('swaps').select('*')
    .eq('business_id', S.profile.business_id).order('created_at', { ascending: false });
  const { data: d2 } = await sb.from('swap_requests').select('*')
    .eq('business_id', S.profile.business_id).order('created_at', { ascending: false });
  S.swaps = d1 || [];
  S.swapRequests = d2 || [];
}

export async function loadSchedule() {
  if (!S.profile?.business_id) return;
  const weekDates = getWeekDates(S.weekOffset);
  const weekStart = weekDates[0];
  const { data: sched } = await sb.from('schedules')
    .select('*').eq('business_id', S.profile.business_id)
    .eq('week_start', weekStart).maybeSingle();

  if (!sched) { S.schedule = {}; S.currentPublishType = null; return; }

  const userIsEmployee = S.profile?.role === 'employee';
  if (userIsEmployee && !sched.published) { S.schedule = {}; S.currentPublishType = null; return; }
  if (!isManager() && !sched.published) { S.schedule = {}; S.currentPublishType = null; return; }

  if (sched.published) {
    if (sched.publish_type === 'final') S.publishedWeeks.add(weekStart);
    S.publishedInitial = S.publishedInitial || new Set();
    if (sched.publish_type === 'initial' || sched.published) S.publishedInitial.add(weekStart);
    S.schedPublishType = S.schedPublishType || {};
    S.schedPublishType[weekStart] = sched.publish_type || (sched.published ? 'final' : null);
  }

  const { data: assignments } = await sb.from('assignments')
    .select('*').eq('schedule_id', sched.id);

  const sched_obj = {};
  weekDates.forEach(d => {
    sched_obj[d] = {};
    SHIFTS.forEach(sh => { sched_obj[d][sh.id] = []; });
  });
  (assignments || []).forEach(a => {
    if (!sched_obj[a.date]) sched_obj[a.date] = {};
    if (!sched_obj[a.date][a.shift]) sched_obj[a.date][a.shift] = [];
    if (!sched_obj[a.date][a.shift].includes(a.employee_id)) sched_obj[a.date][a.shift].push(a.employee_id);
    if (a.custom_start && a.custom_end) {
      S.customHours[a.date + '|' + a.shift + '|' + a.employee_id] = { start: a.custom_start, end: a.custom_end };
    }
    if (a.note) {
      S.assignmentNotes[a.date + '|' + a.shift + '|' + a.employee_id] = a.note;
    }
  });
  S.schedule = sched_obj;
}

let _postLoadFn = () => {};
export function setPostLoadFn(fn) { _postLoadFn = fn; }

export async function loadAll(user) {
  S.user = user;
  const { data: profile } = await sb.from('profiles')
    .select('*, business:businesses(*)').eq('id', user.id).maybeSingle();
  if (!profile) return null;

  profile.name = profile.name || 'משתמש ללא שם';
  S.profile = profile;
  S.business = profile.business;
  S.systems = profile.business?.systems || [];
  S.qualifications = profile.business?.qualifications || { systems: {}, shifts: {} };

  // Apply saved shift hours from business config
  const savedHours = profile.business?.shift_hours || {};
  if (savedHours.morning?.start)   { SHIFTS[0].start = savedHours.morning.start;   SHIFTS[0].end = savedHours.morning.end; }
  if (savedHours.morning2?.start)  { SHIFTS[1].start = savedHours.morning2.start;  SHIFTS[1].end = savedHours.morning2.end; }
  if (savedHours.afternoon?.start) { SHIFTS[2].start = savedHours.afternoon.start; SHIFTS[2].end = savedHours.afternoon.end; }
  if (savedHours.night?.start)     { SHIFTS[3].start = savedHours.night.start;     SHIFTS[3].end = savedHours.night.end; }
  if (savedHours.weMorning?.start) { WEEKEND_SHIFTS[0].start = savedHours.weMorning.start; WEEKEND_SHIFTS[0].end = savedHours.weMorning.end; }
  if (savedHours.weNight?.start)   { WEEKEND_SHIFTS[1].start = savedHours.weNight.start;   WEEKEND_SHIFTS[1].end = savedHours.weNight.end; }

  await loadEmployees();
  await Promise.all([loadVacations(), loadSwapRequests(), loadAvailSubmissions(), loadSchedule(), loadInvitations()]);

  if (S.profile.role === 'employee') {
    S.view = 'empview';
    S.empViewId = S.user.id;
  } else {
    S.view = 'home';
  }

  _postLoadFn();
  return profile;
}

// ══════════════════════════════════════════════════════
// AUDIT LOG
// ══════════════════════════════════════════════════════
export async function logAction(action, details) {
  if (!S.user || !S.profile?.business_id) return;
  try {
    await sb.from('audit_log').insert({
      business_id: S.profile.business_id,
      user_id: S.user.id,
      user_email: S.profile.email || null,
      user_name: S.profile.name || null,
      action,
      details: details || null,
      user_agent: navigator.userAgent.substring(0, 200)
    });
  } catch (err) {
    console.warn('Audit log failed:', err);
  }
}

// ══════════════════════════════════════════════════════
// SCHEDULE PERSISTENCE
// ══════════════════════════════════════════════════════
let _saveTimer = null;
let _swapCacheDirty = false;

export function invalidateSwapCache() { _swapCacheDirty = true; }

export function saveScheduleToDB(renderFn = () => {}, toastFn = () => {}) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    if (!S.profile?.business_id) return;
    const weekDates = getWeekDates(S.weekOffset);
    const weekStart = weekDates[0];

    try {
      let { data: sched, error: schedError } = await sb.from('schedules')
        .select('id').eq('business_id', S.profile.business_id).eq('week_start', weekStart).maybeSingle();
      if (schedError && schedError.code !== 'PGRST116') throw schedError;

      if (!sched) {
        const { data: ns, error: insertError } = await sb.from('schedules')
          .insert({ business_id: S.profile.business_id, week_start: weekStart, created_by: S.user.id }).select().single();
        if (insertError) throw insertError;
        sched = ns;
      }
      if (!sched) return;

      const { error: deleteError } = await sb.from('assignments').delete().eq('schedule_id', sched.id);
      if (deleteError) throw deleteError;

      const rows = [];
      Object.entries(S.schedule).forEach(([date, shifts]) => {
        if (date === 'id' || typeof shifts !== 'object') return;
        Object.entries(shifts).forEach(([shift, empIds]) => {
          if (!Array.isArray(empIds)) return;
          [...new Set(empIds)].forEach(empId => {
            const ch = S.customHours[date + '|' + shift + '|' + empId];
            const noteVal = S.assignmentNotes[date + '|' + shift + '|' + empId];
            rows.push({
              schedule_id: sched.id, employee_id: empId, date, shift,
              custom_start: ch?.start || null, custom_end: ch?.end || null,
              note: noteVal || null
            });
          });
        });
      });

      if (rows.length > 0) {
        const { error: assignError } = await sb.from('assignments').upsert(rows,
          { onConflict: 'schedule_id,employee_id,date,shift' });
        if (assignError) throw assignError;
      }
    } catch (err) {
      console.error('Save error:', err);
      toastFn('שגיאה בשמירה: ' + (err.message || err.details || ''), 'err');
    }
  }, 800);
}

// ══════════════════════════════════════════════════════
// CROSS-WEEK CACHE
// ══════════════════════════════════════════════════════
const _crossWeekCache = {};

export async function loadDateAssignments(dateStr) {
  if (_crossWeekCache[dateStr]) return _crossWeekCache[dateStr];
  if (S.schedule[dateStr]) {
    _crossWeekCache[dateStr] = S.schedule[dateStr];
    return S.schedule[dateStr];
  }
  try {
    const dt = new Date(dateStr + 'T12:00:00');
    const dow = dt.getDay();
    const weekStart = new Date(dt);
    weekStart.setDate(dt.getDate() - dow);
    const wsStr = weekStart.getFullYear() + '-' + String(weekStart.getMonth() + 1).padStart(2, '0') + '-' + String(weekStart.getDate()).padStart(2, '0');
    const { data: sched } = await sb.from('schedules').select('id')
      .eq('business_id', S.profile.business_id).eq('week_start', wsStr).maybeSingle();
    const result = {};
    if (sched) {
      const { data: assigns } = await sb.from('assignments').select('*')
        .eq('schedule_id', sched.id).eq('date', dateStr);
      (assigns || []).forEach(a => {
        if (!result[a.shift]) result[a.shift] = [];
        result[a.shift].push(a.employee_id);
      });
    }
    _crossWeekCache[dateStr] = result;
    return result;
  } catch (err) {
    console.warn('Could not load cross-week:', err);
    return {};
  }
}
