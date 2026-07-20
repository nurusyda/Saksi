// WhatsApp send via Fonnte — wired 2026-07-20. Fonnte is flagged as a
// pre-launch swap candidate (Meta Cloud API is the longer-term target —
// see ops.md), but it's the live channel for the deadline-sweep nudges
// right now. The OTP verification *flow* itself (a separate, unbuilt
// feature) is still deferred until build step 4 regardless of this client.

import { maskPhone } from '@/lib/db/accountHistory';

const FONNTE_API_URL = 'https://api.fonnte.com/send';

export interface WaMessage {
  toPhoneE164: string;
  // Turn-taking templates added for the UX-audit fix pass (2026-07-20,
  // copy-id.md §9b) — one per state transition, fired to whichever party
  // must act next. DEADLINE_NUDGE remains the only one the deadline-sweep
  // cron sends; the rest are sent inline from the transition actions
  // themselves (joinDeal, submitBukti, confirmReceipt).
  //
  // COUNTERPART_JOINED/PARTY_ACCEPTED retired 2026-07-20 (see
  // formatCounterpartJoinedMessage's retirement note in lib/copy.ts): both
  // described a "come accept" step joinDeal no longer has — it fires
  // DISEPAKATI directly now, so DISEPAKATI below covers what used to be two
  // separate pings in one.
  template:
    | 'DEADLINE_NUDGE'
    | 'DISEPAKATI'
    | 'BUKTI_UPLOADED'
    | 'RECEIPT_CONFIRMED'
    | 'PAYMENT_NOT_RECEIVED'
    // Build step 4 (breach path) — copy-id.md §9's AUTHENTICATION-category
    // OTP message, and the report-filing turn-taking nudges. Two distinct
    // FILED literals (same message text, formatBreachReportFiledMessage)
    // purely so [wa] logs distinguish which entry point fired.
    | 'OTP_BREACH_REPORT'
    | 'BARANG_TIDAK_SESUAI_FILED'
    | 'DEADLINE_LAPSE_FILED'
    | 'HAK_JAWAB_FILED';
  params: Record<string, string>;
}

/** Strip the + from E.164 so Fonnte receives 628xx, not +628xx. */
function e164ToFonnteTarget(phoneE164: string): string {
  return phoneE164.replace(/^\+/, '');
}

// Single source of truth for "did Fonnte actually accept this send" — HTTP
// status and body-level acceptance are two independent gates (Fonnte
// returns 200 even on a rejected send: invalid target, out-of-package,
// device disconnected), and collapsing them into one function avoids the
// two-sequential-guard-block shape where a future edit could touch one gate
// without noticing the other still needs to hold. Neither the response body
// nor the message text is logged (may echo content back).
async function wasFonnteSendAccepted(resp: Response, masked: string): Promise<boolean> {
  if (!resp.ok) {
    console.error(`[wa] Fonnte API ${resp.status} for ${masked}`);
    return false;
  }

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    console.error(`[wa] Fonnte API returned non-JSON body for ${masked}`);
    return false;
  }

  const accepted = typeof body === 'object' && body !== null && (body as { status?: unknown }).status === true;
  if (!accepted) {
    console.error(`[wa] Fonnte rejected send for ${masked}`);
  }
  return accepted;
}

export async function sendWaMessage(msg: WaMessage): Promise<{ sent: boolean }> {
  const apiKey = process.env.FONNTE_API_KEY;
  if (!apiKey) {
    console.error('[wa] FONNTE_API_KEY not set');
    return { sent: false };
  }

  const target = e164ToFonnteTarget(msg.toPhoneE164);
  const message = msg.params.message ?? '';

  // Never log message content: free-text item_desc in DEADLINE_NUDGE could
  // incidentally contain PII the user typed in, even though item_desc isn't
  // categorically PII (it's public via deals_public).
  const masked = maskPhone(msg.toPhoneE164);
  console.log(`[wa] send ${msg.template} to ${masked}`);

  try {
    const controller = new AbortController();
    // Short timeout: the sweep loop awaits each send sequentially, and a hung
    // request would stall every later candidate. Fonnte typically responds in
    // under 2s; 10s is generous without letting one bad request eat the run.
    const timer = setTimeout(() => controller.abort(), 10_000);

    const resp = await fetch(FONNTE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ target, message, countryCode: '62' }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!(await wasFonnteSendAccepted(resp, masked))) {
      return { sent: false };
    }

    console.log(`[wa] sent ${msg.template} to ${masked}`);
    return { sent: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[wa] send failed for ${masked}: ${reason}`);
    return { sent: false };
  }
}
