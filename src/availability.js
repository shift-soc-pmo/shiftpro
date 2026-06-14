import { sb } from './supabase.js';
import { S } from './state.js';
import { silentRefresh } from './realtime.js';

let _toast = () => {};
export function setAvailabilityDeps(toastFn) { _toast = toastFn; }

// ══════════════════════════════════════════════════════
// AVAILABILITY SUBMISSION
// ══════════════════════════════════════════════════════
export async function submitAvailability(empId, weekStart, slots, note) {
  await sb.from('availability_submissions').upsert({
    employee_id: empId,
    business_id: S.profile.business_id,
    week_start: weekStart,
    slots,
    note: note || null
  }, { onConflict: 'employee_id,week_start' });
  _toast('זמינות נשלחה ✓');
  silentRefresh();
}
