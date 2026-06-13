import { sb } from './supabase.js';
import { S } from './state.js';
import { loadAll } from './db.js';
import { render } from './utils.js';

// ══════════════════════════════════════════════════════
// AUTHENTICATION
// ══════════════════════════════════════════════════════

export async function checkAuth(renderFn = () => {}) {
  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get('invite');

  if (inviteToken) {
    const { data, error } = await sb.rpc('validate_invitation_token', { p_token: inviteToken });
    if (error || !data || data.length === 0) {
      alert('הלינק לא תקין');
      window.history.replaceState({}, '', window.location.pathname);
    } else {
      const inv = data[0];
      if (!inv.is_valid) {
        const reasons = {
          invalid_token: 'הלינק לא תקין',
          already_used: 'ההזמנה כבר נוצלה',
          revoked: 'ההזמנה בוטלה',
          expired: 'ההזמנה פגה'
        };
        alert(reasons[inv.error_reason] || 'ההזמנה לא תקפה');
        window.history.replaceState({}, '', window.location.pathname);
      } else {
        S.pendingInvitation = {
          token: inviteToken,
          email: inv.email,
          name: inv.name,
          role: inv.role,
          businessName: inv.business_name
        };
        S.loginMode = 'accept_invitation';
        S.view = 'login';
        renderFn();
        return;
      }
    }
  }

  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) { S.view = 'login'; renderFn(); return; }
  await loadAll(session.user);
}

export async function handleLogin(email, password, onSuccess) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const { data: { user } } = await sb.auth.getUser();
  await loadAll(user);
  if (onSuccess) onSuccess();
}

export async function handleRegister(name, businessName, email, password, onSuccess) {
  const { data: auth, error: ae } = await sb.auth.signUp({ email, password, options: { data: { name } } });
  if (ae) throw ae;
  const { data: biz, error: be } = await sb.from('businesses')
    .insert({ name: businessName, owner_id: auth.user.id }).select().single();
  if (be) throw be;
  await sb.from('profiles').update({ business_id: biz.id, role: 'admin', name }).eq('id', auth.user.id);
  await loadAll(auth.user);
  if (onSuccess) onSuccess();
}

export async function handleAcceptInvitation(name, password, token, email, onSuccess) {
  if (!name?.trim()) throw new Error('נא להזין שם');
  if (!password || password.length < 6) throw new Error('סיסמה חייבת להיות לפחות 6 תווים');

  const { data: auth, error: signupError } = await sb.auth.signUp({
    email,
    password,
    options: { data: { name: name.trim() } }
  });
  if (signupError) throw signupError;
  if (!auth.user) throw new Error('שגיאה ביצירת המשתמש');

  const { data: consumeResult, error: consumeError } = await sb.rpc('consume_invitation', {
    p_token: token,
    p_user_id: auth.user.id
  });
  if (consumeError) throw consumeError;

  const result = consumeResult?.[0];
  if (!result?.success) {
    const reasons = {
      invalid_token: 'הלינק לא תקין',
      already_used: 'ההזמנה כבר נוצלה',
      revoked: 'ההזמנה בוטלה',
      expired: 'ההזמנה פגה',
      used: 'ההזמנה כבר נוצלה'
    };
    throw new Error(reasons[result?.error_reason] || 'שגיאה בקבלת ההזמנה');
  }

  window.history.replaceState({}, '', window.location.pathname);
  S.pendingInvitation = null;
  S.loginMode = 'login';
  await loadAll(auth.user);
  if (onSuccess) onSuccess();
}

export async function handleLogout() {
  await sb.auth.signOut();
  Object.assign(S, {
    view: 'login', user: null, profile: null, business: null,
    employees: [], vacations: [], schedule: {}, publishedWeeks: new Set()
  });
  render();
}
