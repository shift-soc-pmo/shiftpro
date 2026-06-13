import { sb } from './supabase.js';
import { S } from './state.js';
import { generateSecureToken, isValidEmail, getEmp } from './utils.js';
import { loadEmployees, loadInvitations, logAction } from './db.js';
import { sendEmail } from './notifications.js';
import { silentRefresh } from './realtime.js';

let _render = () => {};
let _toast = () => {};
export function setEmployeesDeps(renderFn, toastFn) { _render = renderFn; _toast = toastFn; }

// ══════════════════════════════════════════════════════
// INVITATIONS
// ══════════════════════════════════════════════════════
export async function createInvitation() {
  const { name, email, role } = S.newInvitation;
  if (!email.trim()) { _toast('חובה להזין מייל', 'err'); return; }
  if (!isValidEmail(email.trim())) { _toast('מייל לא תקין', 'err'); return; }

  const normalizedEmail = email.trim().toLowerCase();
  const existingEmp = S.employees.find(e => (e.email || '').toLowerCase() === normalizedEmail);
  if (existingEmp) { _toast('עובד עם המייל הזה כבר קיים', 'err'); return; }

  const existingInv = S.invitations.find(i => i.email.toLowerCase() === normalizedEmail && i.status === 'pending');
  if (existingInv) {
    if (!confirm('יש כבר הזמנה פתוחה למייל הזה. ליצור חדשה (הישנה תבוטל)?')) return;
    await sb.from('invitations').update({ status: 'revoked' }).eq('id', existingInv.id);
  }

  const token = generateSecureToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48);

  const { error } = await sb.from('invitations').insert({
    business_id: S.profile.business_id,
    email: normalizedEmail,
    name: name.trim() || null,
    role: role || 'employee',
    token,
    invited_by: S.user.id,
    invited_by_name: S.profile.name,
    expires_at: expiresAt.toISOString()
  }).select().single();

  if (error) { _toast('שגיאה: ' + error.message, 'err'); return; }

  const inviteUrl = window.location.origin + '/?invite=' + token;
  await sendEmail('invitation', normalizedEmail, {
    inviteeName: name.trim() || 'עובד חדש',
    inviterName: S.profile.name,
    businessName: S.business?.name || 'החברה',
    role: role === 'admin' || role === 'manager' ? 'מנהל' : 'עובד',
    inviteUrl,
    expiresAt: expiresAt.toLocaleDateString('he-IL') + ' ' + expiresAt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  });

  logAction('invitation_sent', { invitee_email: normalizedEmail, role });
  S.showInviteModal = false;
  S.newInvitation = { name: '', email: '', role: 'employee' };
  await loadInvitations();
  _toast('✓ הזמנה נשלחה ל-' + normalizedEmail);
  _render();
}

export async function revokeInvitation(invId) {
  if (!confirm('לבטל את ההזמנה?')) return;
  const { error } = await sb.from('invitations').update({ status: 'revoked' }).eq('id', invId);
  if (error) { _toast('שגיאה: ' + error.message, 'err'); return; }
  logAction('invitation_revoked', { invitation_id: invId });
  await loadInvitations();
  _toast('הזמנה בוטלה');
  _render();
}

export async function resendInvitation(inv) {
  const newToken = generateSecureToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 48);
  const { error } = await sb.from('invitations').update({
    token: newToken, expires_at: expiresAt.toISOString(), status: 'pending'
  }).eq('id', inv.id);
  if (error) { _toast('שגיאה: ' + error.message, 'err'); return; }

  const inviteUrl = window.location.origin + '/?invite=' + newToken;
  await sendEmail('invitation', inv.email, {
    inviteeName: inv.name || 'עובד חדש',
    inviterName: S.profile.name,
    businessName: S.business?.name || 'החברה',
    role: inv.role === 'admin' || inv.role === 'manager' ? 'מנהל' : 'עובד',
    inviteUrl,
    expiresAt: expiresAt.toLocaleDateString('he-IL')
  });

  logAction('invitation_resent', { invitation_id: inv.id });
  await loadInvitations();
  _toast('✓ הזמנה נשלחה מחדש ל-' + inv.email);
  _render();
}

export async function copyInviteLink(inv) {
  const inviteUrl = window.location.origin + '/?invite=' + inv.token;
  try {
    await navigator.clipboard.writeText(inviteUrl);
    _toast('✓ הלינק הועתק');
  } catch {
    prompt('העתק את הלינק:', inviteUrl);
  }
}

// ══════════════════════════════════════════════════════
// EMPLOYEE CRUD
// ══════════════════════════════════════════════════════
export async function addEmployee() {
  const { name, email, idNumber, phone, role } = S.newEmp;
  if (!name.trim()) { _toast('נא להזין שם', 'err'); return; }
  const { error } = await sb.from('profiles').insert({
    id: crypto.randomUUID(),
    name, email: email || null, id_number: idNumber || null, phone: phone || null,
    role: role || 'employee', business_id: S.profile.business_id,
    max_shifts_per_week: 5, is_deleted: false
  });
  if (error) { _toast('שגיאה: ' + error.message, 'err'); return; }
  await loadEmployees();
  S.newEmp = { name: '', email: '', idNumber: '', phone: '', role: 'employee' };
  S.showAddEmp = false;
  _toast('עובד נוסף ✓');
  _render();
  silentRefresh(_render);
}

export async function renameEmployee(emp) {
  const newName = prompt('שם חדש עבור ' + emp.name + ':', emp.name);
  if (!newName?.trim() || newName.trim() === emp.name) return;
  const trimmed = newName.trim();
  if (trimmed.length < 2) { _toast('שם חייב להיות לפחות 2 תווים', 'err'); return; }
  const { error } = await sb.from('profiles').update({ name: trimmed }).eq('id', emp.id);
  if (error) { _toast('שגיאה: ' + error.message, 'err'); return; }
  emp.name = trimmed;
  if (emp.id === S.user.id) S.profile.name = trimmed;
  logAction('employee_renamed', { emp_id: emp.id, new_name: trimmed });
  await loadEmployees();
  _toast('✓ השם עודכן ל-' + trimmed);
  _render();
}

export async function resetPassword(emp) {
  if (!emp.email) { _toast('לעובד אין אימייל', 'err'); return; }
  if (!confirm('לשלוח לינק איפוס סיסמה ל-' + emp.name + '?\nהמייל ישלח אל: ' + emp.email)) return;
  const { error } = await sb.auth.resetPasswordForEmail(emp.email, {
    redirectTo: window.location.origin + '/?reset=true'
  });
  if (error) { _toast('שגיאה: ' + error.message, 'err'); return; }
  _toast('✓ לינק איפוס נשלח ל-' + emp.name);
  logAction('password_reset_sent', { emp_id: emp.id, emp_name: emp.name });
}

export async function deleteEmployee(id) {
  const emp = getEmp(id);
  if (!confirm(`למחוק את ${emp?.name} לצמיתות?`)) return;
  await sb.from('profiles').update({ is_deleted: true }).eq('id', id);
  await loadEmployees();
  _toast((emp?.name || 'עובד') + ' נמחק', 'err');
  _render();
}

export async function saveConstraints(empId, data) {
  const { error } = await sb.from('profiles').update({
    max_shifts_per_week: data.maxShifts,
    block_limits: data.blockLimits || null,
    active_days: data.activeDays || [0, 1, 2, 3, 4, 5, 6],
    allowed_shifts: data.allowedShifts || null,
    exclude_from: data.excludeFrom || null,
    exclude_to: data.excludeTo || null,
    exclude_reason: data.excludeReason || null,
    fixed_shifts: data.fixedShifts || null
  }).eq('id', empId);
  if (error) { _toast('שגיאה בשמירה: ' + error.message, 'err'); return; }
  await loadEmployees();
  S.constraintsEmp = null;
  _toast('הגבלות נשמרו ✓');
  _render();
  silentRefresh(_render);
}
