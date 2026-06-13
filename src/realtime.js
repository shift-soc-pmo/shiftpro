import { sb } from './supabase.js';
import { S } from './state.js';
import { loadSchedule, loadAvailSubmissions, loadSwapRequests, loadVacations, loadEmployees } from './db.js';

// ══════════════════════════════════════════════════════
// REALTIME — Supabase live subscriptions
// ══════════════════════════════════════════════════════
let _realtimeChannels = [];

function isUserBusy() {
  if (S.selectedCell) return true;
  if (S.constraintsEmp) return true;
  if (S.showAddEmp) return true;
  if (S.showAddVac) return true;
  if (S.showPublishModal) return true;
  if (S.showExportModal) return true;
  if (S.showWeekNotes) return true;
  if (S.showSwapModal) return true;
  if (S.view === 'blocks' || (S.view === 'empview' && S.empViewTab === 'avail')) return true;
  if (S.view === 'manager_blocks' && S.mgrBlocksTab === 'mine') return true;
  if (Object.values(S.availDraft || {}).some(Boolean)) return true;
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return true;
  return false;
}

export { isUserBusy };

export function setupRealtime(renderFn = () => {}) {
  _realtimeChannels.forEach(ch => sb.removeChannel(ch));
  _realtimeChannels = [];

  if (!S.profile?.business_id) return;
  const bizId = S.profile.business_id;

  const refresh = (loadFn) => () => {
    if (!isUserBusy()) loadFn().then(renderFn);
  };

  const channel = sb.channel('shiftpro_' + bizId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules',   filter: 'business_id=eq.' + bizId }, refresh(() => loadSchedule()))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments'                                     }, refresh(() => loadSchedule()))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'availability_submissions'                        }, refresh(() => loadAvailSubmissions()))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'swaps'                                          }, refresh(() => loadSwapRequests()))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vacations'                                      }, refresh(() => loadVacations()))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles',    filter: 'business_id=eq.' + bizId }, refresh(() => loadEmployees()))
    .subscribe();

  _realtimeChannels.push(channel);
  console.log('📡 Realtime subscribed for business:', bizId);
}

export function teardownRealtime() {
  _realtimeChannels.forEach(ch => sb.removeChannel(ch));
  _realtimeChannels = [];
}

// ══════════════════════════════════════════════════════
// AUTO REFRESH — silent reload every 30 seconds
// ══════════════════════════════════════════════════════
let _autoRefreshTimer = null;
let _refreshDebounce = null;

export function silentRefresh(renderFn = () => {}) {
  clearTimeout(_refreshDebounce);
  _refreshDebounce = setTimeout(async () => {
    if (!S.user || S.view === 'login' || S.view === 'loading') return;
    if (isUserBusy()) return;
    try {
      await Promise.all([loadSchedule(), loadAvailSubmissions(), loadSwapRequests(), loadVacations(), loadEmployees()]);
      renderFn();
    } catch (err) {
      console.warn('Auto-refresh failed:', err);
    }
  }, 1500);
}

export function startAutoRefresh(renderFn = () => {}) {
  if (_autoRefreshTimer) clearInterval(_autoRefreshTimer);
  _autoRefreshTimer = setInterval(() => {
    if (!isUserBusy()) silentRefresh(renderFn);
  }, 30000);
}
