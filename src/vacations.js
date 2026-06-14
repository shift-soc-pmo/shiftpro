import { sb } from './supabase.js';
import { S } from './state.js';
import { getEmp } from './utils.js';
import { loadVacations } from './db.js';
import { sendEmail } from './notifications.js';
import { silentRefresh } from './realtime.js';

let _render = () => {};
let _toast = () => {};
export function setVacationsDeps(renderFn, toastFn) { _render = renderFn; _toast = toastFn; }

// ══════════════════════════════════════════════════════
// VACATION / ABSENCE ACTIONS
// ══════════════════════════════════════════════════════
export async function addVacation() {
  if (!S.newVac.startDate || !S.newVac.endDate) { _toast('נא למלא תאריכים', 'err'); return; }
  if (S.newVac.endDate < S.newVac.startDate) { _toast('תאריך סיום לפני התחלה', 'err'); return; }

  const type = S.newVac.type || 'vacation';
  const empId = S.newVac.employeeId || (S.testAsEmployee ? S.empViewId : S.user.id);

  const { error } = await sb.from('vacations').insert([{
    employee_id: empId,
    business_id: S.profile.business_id,
    start_date: S.newVac.startDate,
    end_date: S.newVac.endDate,
    type,
    status: 'pending',
    reason: S.newVac.reason || null
  }]);
  if (error) { _toast('שגיאה: ' + error.message, 'err'); return; }

  const typeLabel = type === 'reserve' ? 'מילואים 🎖️' : type === 'exam' ? 'מבחן 📝' : 'חופשה 🌴';
  const reqEmp = getEmp(empId) || S.profile;
  S.employees
    .filter(e => (e.role === 'admin' || e.role === 'manager') && e.email)
    .forEach(adminEmp => {
      sendEmail('absence_request', adminEmp.email, {
        requesterName: reqEmp.name, typeLabel, type,
        startDate: S.newVac.startDate, endDate: S.newVac.endDate, reason: S.newVac.reason || ''
      });
    });

  const labels = { vacation: 'חופשה 🌴', reserve: 'מילואים 🎖️', exam: 'מבחן 📝' };
  _toast(`בקשת ${labels[type] || 'היעדרות'} נשלחה לאישור מנהל ✓`);
  S.showAddVac = false;
  S.newVac = { type: 'vacation', startDate: '', endDate: '', reason: '' };
  await loadVacations();
  _render();
  silentRefresh(_render);
}

export async function deleteVacRequest(id) {
  if (!confirm('למחוק את הבקשה?')) return;
  const { error } = await sb.from('vacations').delete().eq('id', id);
  if (error) { _toast('שגיאה במחיקה: ' + error.message, 'err'); return; }
  S.vacations = S.vacations.filter(v => v.id !== id);
  _toast('הבקשה נמחקה ✓');
  _render();
}

export async function updateVacStatus(id, status, rejectReason) {
  const updateData = { status, approved_by: S.user.id };
  if (rejectReason) updateData.reject_reason = rejectReason;
  await sb.from('vacations').update(updateData).eq('id', id);
  await loadVacations();
  _toast(status === 'approved' ? 'חופשה אושרה ✓' : 'חופשה נדחתה');
  _render();
  silentRefresh(_render);

  const vac = S.vacations.find(v => v.id === id);
  if (vac) {
    const emp = getEmp(vac.employee_id);
    if (emp?.email) {
      sendEmail(
        status === 'approved' ? 'vacation_approved' : 'vacation_rejected',
        emp.email,
        { empName: emp.name, startDate: vac.start_date, endDate: vac.end_date, reason: vac.reason || '', rejectReason: rejectReason || '' }
      );
    }
  }
}
