// WhatsApp send interface stub — logs intent only, matching
// lib/db/anchor.ts's existing stub pattern for OpenTimestamps. The number is
// registered and FONNTE_API_KEY is live in env (see ops.md, updated
// 2026-07-20) — a real client is buildable whenever that upgrade is
// prioritized; this just hasn't been wired to Fonnte yet. The OTP
// verification *flow* itself (a separate, unbuilt feature) is still
// deferred until build step 4 regardless of this stub's status.

export interface WaMessage {
  toPhoneE164: string;
  template: 'DEADLINE_NUDGE';
  params: Record<string, string>;
}

// Same first+last masking style as maskRekening (lib/db/accountHistory.ts) —
// found by monster_check: the raw phone number was going straight into
// console.log, and this stub is shipping code that runs in production logs.
function maskPhone(phoneE164: string): string {
  if (phoneE164.length <= 6) return phoneE164;
  const first = phoneE164.slice(0, 4);
  const last = phoneE164.slice(-2);
  return `${first}${'•'.repeat(phoneE164.length - 6)}${last}`;
}

export async function sendWaMessage(msg: WaMessage): Promise<{ sent: boolean }> {
  // Deliberately not logging msg.params: it carries the rendered message
  // text, which for DEADLINE_NUDGE includes item_desc — free-text user
  // input that could incidentally contain PII the user typed in, even
  // though item_desc itself isn't categorically PII (it's already public
  // via deals_public). Template name + masked phone is enough to debug the
  // stub without aggregating message content into server logs.
  console.log(`[wa] STUB send ${msg.template} to ${maskPhone(msg.toPhoneE164)}`);
  return { sent: false };
}
