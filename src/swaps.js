import { sb } from './supabase.js';
import { S } from './state.js';
import { SHIFT_BY_ID } from './config.js';
import { getEmp } from './utils.js';
import { loadSwapRequests } from './db.js';
import { sendEmail } from './notifications.js';
import { silentRefresh } from './realtime.js';

let _render = () => {};
let _toast = () => {};
export function setSwapsDeps(renderFn, toastFn) { _render = renderFn; _toast = toastFn; }

// ══════════════════════════════════════════════════════
// SWAP ACTIONS
// ══════════════════════════════════════════════════════
export async function updateSwapStatus(id, status) {
  await sb.from('swap_requests').update({ status }).eq('id', id);
  await loadSwapRequests();
  _toast(status === 'approved' ? 'חילוף אושר ✓' : 'חילוף נדחה');
  _render();

  const swap = S.swapRequests.find(s => s.id === id);
  if (swap) {
    const requester = getEmp(swap.requester_id);
    if (requester?.email) {
      const sh = SHIFT_BY_ID[swap.target_shift];
      sendEmail(
        status === 'approved' ? 'vacation_approved' : 'vacation_rejected',
        requester.email,
        {
          empName: requester.name,
          startDate: swap.target_date + ' — ' + (sh?.label || swap.target_shift),
          endDate: swap.target_date,
          reason: 'בקשת חילוף ' + (status === 'approved' ? 'אושרה' : 'נדחתה')
        }
      );
    }
  }
}
