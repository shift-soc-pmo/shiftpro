import { sb } from './supabase.js';
import { S } from './state.js';
import { SHIFTS, DAYS, SHIFT_BY_ID } from './config.js';
import { getWeekDates, fmtDate, getEmp } from './utils.js';
import { loadAvailSubmissions, saveScheduleToDB, logAction, loadDateAssignments } from './db.js';
import { sendEmail } from './notifications.js';
import { silentRefresh } from './realtime.js';

// Set by main.js
let _render = () => {};
let _toast = () => {};
export function setScheduleActionsDeps(renderFn, toastFn) { _render = renderFn; _toast = toastFn; }

// ══════════════════════════════════════════════════════
// CONFLICT DETECTION
// ══════════════════════════════════════════════════════
export function checkShiftConflict(date, shift, empId, ignoreDate = null, ignoreShift = null) {
  const emp = getEmp(empId);
  const name = emp?.name || 'עובד';
  const isAssigned = (d, s) => {
    if (d === ignoreDate && s === ignoreShift) return false;
    return (S.schedule[d]?.[s] || []).includes(empId);
  };

  const todayShifts = SHIFTS.filter(sh => sh.id !== shift && isAssigned(date, sh.id));
  if (todayShifts.length > 0) return `${name} כבר משובץ ל${todayShifts[0].label} ביום זה`;

  if (shift === 'morning' || shift === 'morning2') {
    const yesterday = new Date(new Date(date + 'T12:00:00').getTime() - 86400000);
    const yStr = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');
    if (isAssigned(yStr, 'night')) return `${name} עבד לילה אתמול — לא ניתן לשבץ לבוקר`;
  }

  if (shift === 'night') {
    const tomorrow = new Date(new Date(date + 'T12:00:00').getTime() + 86400000);
    const tStr = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + String(tomorrow.getDate()).padStart(2, '0');
    if (isAssigned(tStr, 'morning')) return `${name} משובץ לבוקר מחר — לא ניתן לשבץ ללילה`;
  }

  return null;
}

export async function checkShiftConflictAsync(date, shift, empId, ignoreDate = null, ignoreShift = null) {
  const syncCheck = checkShiftConflict(date, shift, empId, ignoreDate, ignoreShift);
  if (syncCheck) return syncCheck;
  const emp = getEmp(empId);
  const name = emp?.name || 'עובד';

  if (shift === 'morning' || shift === 'morning2') {
    const yesterday = new Date(new Date(date + 'T12:00:00').getTime() - 86400000);
    const yStr = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');
    if (!S.schedule[yStr]) {
      const prevDay = await loadDateAssignments(yStr);
      if ((prevDay['night'] || []).includes(empId))
        return name + ' עבד לילה ב-' + fmtDate(yStr) + ' — לא ניתן לשבץ לבוקר';
    }
  }

  if (shift === 'night') {
    const tomorrow = new Date(new Date(date + 'T12:00:00').getTime() + 86400000);
    const tStr = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + String(tomorrow.getDate()).padStart(2, '0');
    if (!S.schedule[tStr]) {
      const nextDay = await loadDateAssignments(tStr);
      if ((nextDay['morning'] || []).includes(empId) || (nextDay['morning2'] || []).includes(empId))
        return name + ' משובץ לבוקר ב-' + fmtDate(tStr) + ' — לא ניתן לשבץ ללילה';
    }
  }

  return null;
}

// ══════════════════════════════════════════════════════
// TOGGLE CELL
// ══════════════════════════════════════════════════════
export async function toggleCellEmp(date, shift, empId) {
  const weekStart = getWeekDates(S.weekOffset)[0];
  if (S.publishedWeeks.has(weekStart) && !confirm('השבוע פורסם. לשנות בכל זאת?')) return;

  if (!S.schedule[date]) S.schedule[date] = {};
  if (!S.schedule[date][shift]) S.schedule[date][shift] = [];
  const arr = S.schedule[date][shift];
  const idx = arr.indexOf(empId);

  if (idx >= 0) {
    S.schedule[date][shift] = arr.filter(id => id !== empId);
  } else {
    const conflict = checkShiftConflict(date, shift, empId);
    if (conflict) { _toast(conflict, 'err'); return; }

    const crossConflict = await checkShiftConflictAsync(date, shift, empId);
    if (crossConflict && !confirm('⚠️ אזהרה: ' + crossConflict + '\n\nלשבץ בכל זאת?')) return;

    const blockShiftId = shift === 'morning2' ? 'morning' : shift;
    const empBlocked = S.availSubmissions.some(s =>
      s.employee_id === empId &&
      (s.slots || []).some(sl => sl.date === date && (sl.shift === blockShiftId || sl.shift === shift))
    );
    if (empBlocked && !confirm('⚠️ ' + (getEmp(empId)?.name || 'העובד') + ' חסם את המשמרת הזו!\nלשבץ בכל זאת?')) return;

    if (!arr.includes(empId)) arr.push(empId);
  }

  saveScheduleToDB(_render, _toast);
  _render();
}

export function toggleLock(date, shift, empId) {
  const key = date + '|' + shift;
  if (!S.lockedSlots[key]) S.lockedSlots[key] = new Set();
  if (S.lockedSlots[key].has(empId)) S.lockedSlots[key].delete(empId);
  else S.lockedSlots[key].add(empId);
  _render();
}

// ══════════════════════════════════════════════════════
// PUBLISH WEEK
// ══════════════════════════════════════════════════════
function buildEmpShifts(emp, wd) {
  const shifts = [];
  wd.forEach(date => {
    SHIFTS.forEach(sh => {
      if (!(S.schedule[date]?.[sh.id] || []).includes(emp.id)) return;
      const dt = new Date(date + 'T00:00:00');
      const chKey = date + '|' + sh.id + '|' + emp.id;
      const ch = S.customHours?.[chKey];
      const note = S.assignmentNotes?.[chKey] || '';
      let tags = [], freeText = '';
      if (note.startsWith('🏷️ ')) {
        const parts = note.split(' | ');
        tags = parts[0].replace('🏷️ ', '').split(', ').map(t => t.trim()).filter(Boolean);
        freeText = parts.slice(1).join(' | ');
      } else {
        freeText = note;
      }
      shifts.push({
        day: DAYS[dt.getDay()] + ' ' + dt.getDate(),
        label: sh.label,
        hours: (ch?.start || sh.start) + '–' + (ch?.end || sh.end),
        color: sh.color,
        tags,
        note: freeText
      });
    });
  });
  return shifts;
}

export async function publishWeek(type) {
  const wd = getWeekDates(S.weekOffset);
  const weekStart = wd[0];
  const weekLabel = fmtDate(wd[0]) + ' — ' + fmtDate(wd[6]);
  const isFinal = type === 'final';
  const isPreview = type === 'preview';

  if (isPreview) {
    const managers = S.employees.filter(e => (e.role === 'admin' || e.role === 'manager') && e.email);
    if (managers.length === 0) { _toast('אין מנהלים נוספים לשליחה', 'err'); S.showPublishModal = false; _render(); return; }
    for (const mgr of managers) {
      sendEmail('schedule_initial', mgr.email, {
        empName: mgr.name,
        weekLabel: '[בדיקה] — ' + weekLabel,
        shifts: buildEmpShifts(mgr, wd),
        isFinal: false
      });
    }
    S.showPublishModal = false;
    _toast(`📝 סידור לבדיקה נשלח ל-${managers.length} מנהלים`);
    _render();
    logAction('schedule_preview_sent', { week_start: weekStart, recipients: managers.length });
    return;
  }

  const { data: sched } = await sb.from('schedules')
    .select('id').eq('business_id', S.profile.business_id).eq('week_start', weekStart).maybeSingle();
  if (sched) {
    await sb.from('schedules').update({ published: true, publish_type: type }).eq('id', sched.id);
  }

  if (isFinal) S.publishedWeeks.add(weekStart);
  S.publishedInitial = S.publishedInitial || new Set();
  if (!isFinal) S.publishedInitial.add(weekStart);

  S.showPublishModal = false;
  _toast(isFinal ? 'סידור סופי פורסם 📢' : 'סידור ראשוני פורסם 📋');
  _render();
  silentRefresh(_render);

  for (const emp of S.employees) {
    if (!emp.email || emp.id === S.user.id) continue;
    sendEmail(
      isFinal ? 'schedule_published' : 'schedule_initial',
      emp.email,
      { empName: emp.name, weekLabel, shifts: buildEmpShifts(emp, wd), isFinal }
    );
  }
}
