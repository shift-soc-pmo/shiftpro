import { sb } from './supabase.js';
import { S } from './state.js';
import { SHIFTS, DAYS } from './config.js';
import { getWeekDates } from './utils.js';
import { loadAvailSubmissions, logAction } from './db.js';

let _render = () => {};
let _toast = () => {};
export function setSchedulerDeps(renderFn, toastFn) { _render = renderFn; _toast = toastFn; }

// ══════════════════════════════════════════════════════
// SMART SCHEDULING ALGORITHM
// ══════════════════════════════════════════════════════
export async function runSmartSchedule() {
  await loadAvailSubmissions();

  // Preload previous Saturday for night-shift rest checks
  const wDates = getWeekDates(S.weekOffset);
  const prevSat = new Date(new Date(wDates[0] + 'T12:00:00').getTime() - 86400000);
  const prevSatStr = prevSat.getFullYear() + '-' + String(prevSat.getMonth() + 1).padStart(2, '0') + '-' + String(prevSat.getDate()).padStart(2, '0');
  if (!S.schedule[prevSatStr]) {
    try {
      const prevWeekStart = getWeekDates(S.weekOffset - 1)[0];
      const { data: prevSched } = await sb.from('schedules').select('id')
        .eq('business_id', S.profile.business_id).eq('week_start', prevWeekStart).maybeSingle();
      if (prevSched) {
        const { data: prevAssigns } = await sb.from('assignments').select('*')
          .eq('schedule_id', prevSched.id).eq('date', prevSatStr);
        if (prevAssigns?.length > 0) {
          S.schedule[prevSatStr] = {};
          prevAssigns.forEach(a => {
            if (!S.schedule[prevSatStr][a.shift]) S.schedule[prevSatStr][a.shift] = [];
            S.schedule[prevSatStr][a.shift].push(a.employee_id);
          });
        }
      }
    } catch (err) {
      console.warn('Could not preload previous Saturday:', err);
    }
  }

  const weekDates = getWeekDates(S.weekOffset).map(d => new Date(d + 'T00:00:00'));
  const shiftIds = SHIFTS.map(s => s.id);
  const newSched = {};
  const totalCount = {};
  const shiftTypeCount = {};
  const weekendCount = {};

  S.employees.forEach(emp => {
    totalCount[emp.id] = 0;
    shiftTypeCount[emp.id] = {};
    weekendCount[emp.id] = 0;
  });

  // Calculate ideal shifts per employee
  const wt = S.business?.weekend_targets || { morning: 2, night: 1 };
  const st = S.business?.shift_targets || { morning: 2, morning2: 1, afternoon: 1, night: 1 };
  const totalSlotsNeeded = weekDates.reduce((total, d) => {
    const isWE = d.getDay() === 5 || d.getDay() === 6;
    return total + (isWE
      ? (wt.morning || 1) + (wt.night || 1)
      : (st.morning || 2) + (st.morning2 || 1) + (st.afternoon || 1) + (st.night || 1));
  }, 0);

  const availableEmps = S.employees.filter(emp => {
    if (!emp.exclude_from || !emp.exclude_to) return true;
    const weekStart = wDates[0], weekEnd = wDates[6];
    return !(emp.exclude_from <= weekEnd && emp.exclude_to >= weekStart);
  }).length || 1;

  const idealShifts = Math.round(totalSlotsNeeded / availableEmps);
  console.log(`📊 Auto-schedule: ${totalSlotsNeeded} slots / ${availableEmps} employees = ideal ${idealShifts} shifts each`);

  // Rotate shift order by day to prevent patterns
  const SHIFT_ORDERS = [
    ['night', 'afternoon', 'morning2', 'morning'],  // Sun
    ['morning', 'night', 'afternoon', 'morning2'],  // Mon
    ['afternoon', 'morning', 'morning2', 'night'],  // Tue
    ['night', 'morning2', 'morning', 'afternoon'],  // Wed
    ['morning', 'afternoon', 'night', 'morning2'],  // Thu
  ];

  // Process weekends first for fairness
  const schedOrder = [];
  weekDates.forEach((d, i) => { if (d.getDay() === 5 || d.getDay() === 6) schedOrder.push(i); });
  weekDates.forEach((d, i) => { if (d.getDay() !== 5 && d.getDay() !== 6) schedOrder.push(i); });

  schedOrder.forEach(dayIdx => {
    const dateObj = weekDates[dayIdx];
    const dateStr = _dateStr(dateObj);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
    const dayName = DAYS[dayOfWeek];

    newSched[dateStr] = {};
    const dayShiftIds = isWeekend ? shiftIds.filter(s => s !== 'afternoon' && s !== 'morning2') : shiftIds;
    const orderedShiftIds = isWeekend ? dayShiftIds
      : (SHIFT_ORDERS[dayOfWeek] || dayShiftIds).filter(s => dayShiftIds.includes(s));

    orderedShiftIds.forEach((shiftId, shIdx) => {
      const lockedKey = dateStr + '|' + shiftId;
      const lockedEmpIds = S.lockedSlots[lockedKey] ? [...S.lockedSlots[lockedKey]] : [];
      newSched[dateStr][shiftId] = [...lockedEmpIds];
      lockedEmpIds.forEach(id => {
        totalCount[id] = (totalCount[id] || 0) + 1;
        shiftTypeCount[id][shiftId] = (shiftTypeCount[id][shiftId] || 0) + 1;
      });

      // Fixed-schedule employees go first
      S.employees.forEach(emp => {
        if (!emp.fixed_shifts) return;
        if (!emp.fixed_shifts[dayOfWeek + '_' + shiftId]) return;
        if (lockedEmpIds.includes(emp.id) || newSched[dateStr][shiftId].includes(emp.id)) return;
        if ((totalCount[emp.id] || 0) >= (emp.max_shifts_per_week || 5)) return;
        if (SHIFTS.some(s => s.id !== shiftId && (newSched[dateStr]?.[s.id] || []).includes(emp.id))) return;
        if (emp.exclude_from && emp.exclude_to && dateStr >= emp.exclude_from && dateStr <= emp.exclude_to) return;
        if (S.vacations.some(v => v.employee_id === emp.id && v.status === 'approved' && dateStr >= v.start_date && dateStr <= v.end_date)) return;
        if (S.availSubmissions.some(s => s.employee_id === emp.id && (s.slots || []).some(sl => sl.date === dateStr && sl.shift === shiftId))) return;
        newSched[dateStr][shiftId].push(emp.id);
        totalCount[emp.id] = (totalCount[emp.id] || 0) + 1;
        shiftTypeCount[emp.id][shiftId] = (shiftTypeCount[emp.id][shiftId] || 0) + 1;
        if (isWeekend) weekendCount[emp.id] = (weekendCount[emp.id] || 0) + 1;
      });

      const shiftTargets = S.business?.shift_targets || { morning: 2, morning2: 1, afternoon: 1, night: 1 };
      const weekendTargets = S.business?.weekend_targets || { morning: 2, night: 1 };
      const target = isWeekend ? (weekendTargets[shiftId] || 1) : (shiftTargets[shiftId] || 2);
      if (lockedEmpIds.length >= target) return;
      const need = target - lockedEmpIds.length;

      // Score and pick best candidates
      const weekStart0 = wDates[0];
      const scored = [...S.employees]
        .sort(() => Math.random() - 0.5)
        .filter(emp => !lockedEmpIds.includes(emp.id))
        .map(emp => {
          const activeDays = emp.active_days || [0, 1, 2, 3, 4, 5, 6];
          if (!activeDays.includes(dayOfWeek)) return null;

          const empAllowedShifts = emp.allowed_shifts || SHIFTS.map(s => s.id);
          if (!empAllowedShifts.includes(shiftId)) return null;
          if (emp.exclude_from && emp.exclude_to && dateStr >= emp.exclude_from && dateStr <= emp.exclude_to) return null;
          if (S.vacations.some(v => v.employee_id === emp.id && v.status === 'approved' && dateStr >= v.start_date && dateStr <= v.end_date)) return null;

          const avail = emp.availability || DAYS;
          if (!avail.includes(dayName)) return null;
          if ((emp.excluded_days || []).includes(dayOfWeek)) return null;

          const dayConstraints = emp.day_constraints || {};
          if (dayConstraints[dayName]?.[shiftId] === 0) return null;
          if ((totalCount[emp.id] || 0) >= (emp.max_shifts_per_week || 5)) return null;

          const perLimit = emp.max_per_shift?.[shiftId];
          if (perLimit != null && (shiftTypeCount[emp.id][shiftId] || 0) >= perLimit) return null;

          const preferred = emp.preferred_shifts;
          if (preferred?.length > 0 && !preferred.includes(shiftId)) return null;

          const blockedShiftId = shiftId === 'morning2' ? 'morning' : shiftId;
          const isBlocked = S.availSubmissions.some(s =>
            s.employee_id === emp.id &&
            (s.slots || []).some(sl => {
              if (sl.date && sl.date === dateStr) return sl.shift === blockedShiftId || sl.shift === shiftId;
              if (s.week_start === weekStart0) return (sl.shift === blockedShiftId || sl.shift === shiftId) && sl.day === dayOfWeek;
              return false;
            })
          );
          if (isBlocked) return null;

          if (SHIFTS.some(s => s.id !== shiftId && (newSched[dateStr]?.[s.id] || []).includes(emp.id))) return null;
          if (dayShiftIds.slice(0, shIdx).some(s => (newSched[dateStr][s] || []).includes(emp.id))) return null;

          let score = 100;
          if ((emp.preferred_shifts || []).includes(shiftId)) score += 30;
          if (dayConstraints[dayName]?.[shiftId] === 1) score += 20;

          if (isWeekend) {
            score -= (weekendCount[emp.id] || 0) * 25;
            const sameShiftThisWeekend = weekDates
              .filter(wd => (wd.getDay() === 5 || wd.getDay() === 6) && wd !== dateObj)
              .some(wd => (newSched[_dateStr(wd)]?.[shiftId] || []).includes(emp.id));
            if (sameShiftThisWeekend) score -= 40;
          }

          // Rest penalties
          {
            let prevShifts = {};
            if (dayIdx > 0) {
              prevShifts = newSched[_dateStr(weekDates[dayIdx - 1])] || {};
            } else {
              const yesterday = new Date(dateObj.getTime() - 86400000);
              prevShifts = (S.schedule && S.schedule[_dateStr(yesterday)]) || {};
            }
            if ((shiftId === 'morning' || shiftId === 'morning2') && (prevShifts['night'] || []).includes(emp.id)) score -= 200;
            if (shiftId === 'afternoon' && (prevShifts['night'] || []).includes(emp.id)) score -= 60;
            if ((shiftId === 'morning' || shiftId === 'morning2') && (prevShifts['afternoon'] || []).includes(emp.id)) score -= 40;
          }

          if (dayIdx >= 2) {
            const prevShifts = newSched[_dateStr(weekDates[dayIdx - 1])] || {};
            const prev2Shifts = newSched[_dateStr(weekDates[dayIdx - 2])] || {};
            const w1 = SHIFTS.some(s => (prevShifts[s.id] || []).includes(emp.id));
            const w2 = SHIFTS.some(s => (prev2Shifts[s.id] || []).includes(emp.id));
            if (w1 && w2) score -= 25;
          }

          // Equal distribution scoring
          const count = totalCount[emp.id] || 0;
          if (count >= idealShifts + 1) score -= 200;
          else if (count < idealShifts) score += (idealShifts - count) * 40;
          else score -= (count - idealShifts) * 50;
          score -= count * 15;

          return { emp, score };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const diff = b.score - a.score;
          return Math.abs(diff) < 5 ? Math.random() - 0.5 : diff;
        });

      const toAdd = scored.slice(0, need).map(s => s.emp.id);
      newSched[dateStr][shiftId].push(...toAdd);
      toAdd.forEach(id => {
        totalCount[id] = (totalCount[id] || 0) + 1;
        shiftTypeCount[id][shiftId] = (shiftTypeCount[id][shiftId] || 0) + 1;
        if (isWeekend) weekendCount[id] = (weekendCount[id] || 0) + 1;
      });
    });
  });

  // Balance pass — fill under-assigned employees into afternoon shifts
  const weekdayDates = weekDates.filter(d => d.getDay() !== 5 && d.getDay() !== 6);
  for (const emp of S.employees.filter(e => (totalCount[e.id] || 0) < idealShifts - 1 && (totalCount[e.id] || 0) < (e.max_shifts_per_week || 5))) {
    for (const dateObj of weekdayDates) {
      if ((totalCount[emp.id] || 0) >= idealShifts) break;
      const ds = _dateStr(dateObj);
      if (SHIFTS.some(s => (newSched[ds]?.[s.id] || []).includes(emp.id))) continue;
      if (!(emp.active_days || [0, 1, 2, 3, 4, 5, 6]).includes(dateObj.getDay())) continue;
      if (!(emp.allowed_shifts || SHIFTS.map(s => s.id)).includes('afternoon')) continue;
      if (emp.exclude_from && emp.exclude_to && ds >= emp.exclude_from && ds <= emp.exclude_to) continue;
      if (S.vacations.some(v => v.employee_id === emp.id && v.status === 'approved' && ds >= v.start_date && ds <= v.end_date)) continue;
      if (S.availSubmissions.some(s => s.employee_id === emp.id && (s.slots || []).some(sl => sl.date === ds && sl.shift === 'afternoon'))) continue;
      const prevDay = weekDates[weekDates.indexOf(dateObj) - 1];
      if (prevDay && (newSched[_dateStr(prevDay)]?.['night'] || []).includes(emp.id)) continue;
      if (!newSched[ds]['afternoon']) newSched[ds]['afternoon'] = [];
      if (!newSched[ds]['afternoon'].includes(emp.id)) {
        newSched[ds]['afternoon'].push(emp.id);
        totalCount[emp.id] = (totalCount[emp.id] || 0) + 1;
      }
    }
  }

  S.schedule = newSched;

  // Persist to DB immediately
  (async () => {
    if (!S.profile?.business_id) return;
    const weekStart = wDates[0];
    let { data: sched } = await sb.from('schedules').select('id')
      .eq('business_id', S.profile.business_id).eq('week_start', weekStart).maybeSingle();
    if (!sched) {
      const { data: ns } = await sb.from('schedules')
        .insert({ business_id: S.profile.business_id, week_start: weekStart, created_by: S.user.id }).select().single();
      sched = ns;
    }
    if (!sched) return;
    S.schedule.id = sched.id;
    await sb.from('assignments').delete().eq('schedule_id', sched.id);
    const rows = [];
    Object.entries(S.schedule).forEach(([date, shifts]) => {
      if (date === 'id' || !shifts || typeof shifts !== 'object') return;
      Object.entries(shifts).forEach(([shift, empIds]) => {
        if (!Array.isArray(empIds)) return;
        [...new Set(empIds)].forEach(empId => rows.push({ schedule_id: sched.id, employee_id: empId, date, shift }));
      });
    });
    if (rows.length) await sb.from('assignments').upsert(rows, { onConflict: 'schedule_id,employee_id,date,shift' });
    logAction('auto_schedule', { week_start: weekStart, count: Object.keys(newSched).length });
    _toast('שיבוץ אוטומטי נשמר ✓');
  })();

  _render();
}

// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════
function _dateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
