// WhatsApp send via Fonnte — wired 2026-07-20. Fonnte is flagged as a
// pre-launch swap candidate (Meta Cloud API is the longer-term target —
// see ops.md), but it's the live channel for the deadline-sweep nudges
// right now. The OTP verification *flow* itself (a separate, unbuilt
// feature) is still deferred until build step 4 regardless of this client.

const FONNTE_API_URL = 'https://api.fonnte.com/send';

export interface WaMessage {
  toPhoneE164: string;
  // Turn-taking templates added for the UX-audit fix pass (2026-07-20,
  // copy-id.md §9b) — one per state transition, fired to whichever party
  // must act next. DEADLINE_NUDGE remains the only one the deadline-sweep
  // cron sends; the rest are sent inline from the transition actions
  // themselves (joinDeal, acceptDeal, submitBukti, confirmReceipt).
  template:
    | 'DEADLINE_NUDGE'
    | 'COUNTERPART_JOINED'
    | 'PARTY_ACCEPTED'
    | 'DISEPAKATI'
    | 'BUKTI_UPLOADED'
    | 'RECEIPT_CONFIRMED';
  params: Record<string, string>;
}

// Same first+last masking style as maskRekening (lib/db/accountHistory.ts).
function maskPhone(phoneE164: string): string {
  if (phoneE164.length <= 6) return phoneE164;
  const first = phoneE164.slice(0, 4);
  const last = phoneE164.slice(-2);
  return `${first}${'•'.repeat(phoneE164.length - 6)}${last}`;
}

/** Strip the + from E.164 so Fonnte receives 628xx, not +628xx. */
function e164ToFonnteTarget(phoneE164: string): string {
  return phoneE164.replace(/^\+/, '');
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

    if (!resp.ok) {
      // Log status only, not the Fonnte response body (may contain the
      // message text echoed back).
      console.error(`[wa] Fonnte API ${resp.status} for ${masked}`);
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
