import { SUPABASE_KEY } from './config.js';
import { S } from './state.js';

// ══════════════════════════════════════════════════════
// EMAIL NOTIFICATIONS — via Supabase Edge Function + Resend
// ══════════════════════════════════════════════════════
const APP_URL = 'https://shiftpmosoc.com/';
const EDGE_FN_URL = 'https://zszlqoisokjgvplrcbic.supabase.co/functions/v1/rapid-action';

const _emailQueue = [];
let _emailProcessing = false;

async function _processEmailQueue() {
  if (_emailProcessing) return;
  _emailProcessing = true;
  while (_emailQueue.length > 0) {
    const { type, toEmail, data, retries } = _emailQueue.shift();
    try {
      const resp = await fetch(EDGE_FN_URL, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + SUPABASE_KEY,
        },
        body: JSON.stringify({ type, to: toEmail, data: { ...data, appUrl: APP_URL } })
      });

      if (resp.status === 429 && retries < 3) {
        _emailQueue.unshift({ type, toEmail, data, retries: retries + 1 });
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      const result = await resp.json().catch(() => ({}));
      if (resp.status >= 200 && resp.status < 300) {
        console.log('📧 Sent:', type, 'to:', toEmail);
      } else {
        console.warn('📧 Failed:', resp.status, result);
      }
    } catch (err) {
      console.warn('📧 Network error:', err);
    }
    // Throttle: ~1.6 emails/sec (under Resend's 2/sec limit)
    await new Promise(r => setTimeout(r, 600));
  }
  _emailProcessing = false;
}

const EMAIL_NOTIF_MAP = {
  schedule_published: 'notif_publish',
  schedule_initial: 'notif_publish',
  vacation_approved: 'notif_vac_approved',
  vacation_rejected: 'notif_vac_approved',
  swap_request: 'notif_swap',
  absence_request: 'notif_swap',
  block_message: 'notif_swap',
  swap_decision: 'notif_swap',
  reminder: 'notif_publish'
};

export function sendEmail(type, toEmail, data) {
  if (!toEmail) return;
  const settingKey = EMAIL_NOTIF_MAP[type];
  const notifSettings = S.business?.notification_settings || {};
  if (settingKey && notifSettings[settingKey] === false) return;

  _emailQueue.push({ type, toEmail, data, retries: 0 });
  _processEmailQueue();
}
