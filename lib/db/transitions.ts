export const DealStatus = {
  DRAF: 'DRAF',
  DIAJUKAN: 'DIAJUKAN',
  DISEPAKATI: 'DISEPAKATI',
  DIBAYAR_DIKLAIM: 'DIBAYAR_DIKLAIM',
  DIKONFIRMASI_TERIMA: 'DIKONFIRMASI_TERIMA',
  SELESAI: 'SELESAI',
  DIBATALKAN_BERSAMA: 'DIBATALKAN_BERSAMA',
  TIDAK_DILANJUTKAN: 'TIDAK_DILANJUTKAN',
  KEDALUWARSA: 'KEDALUWARSA',
  DIKEMBALIKAN_PENUH: 'DIKEMBALIKAN_PENUH',
  DIKEMBALIKAN_SEBAGIAN: 'DIKEMBALIKAN_SEBAGIAN',
  TIDAK_DIPENUHI: 'TIDAK_DIPENUHI',
  SENGKETA: 'SENGKETA',
} as const;
export type DealStatus = (typeof DealStatus)[keyof typeof DealStatus];

export const DealEventName = {
  // Initial event when the deal row is created (DRAF, no incoming transition)
  CREATED: 'CREATED',
  // Counterpart joins or declines via link
  COUNTERPART_JOINED: 'COUNTERPART_JOINED',
  COUNTERPART_DECLINED: 'COUNTERPART_DECLINED',      // → hard delete, no status transition
  // Both parties' consent, fired automatically the instant the counterpart
  // joins (2026-07-20: folded into COUNTERPART_JOINED's own transaction, see
  // migration 0025 and app/deal/[token]/actions.ts's joinDeal) — attestations
  // already happened at create/join, so there is no separate manual accept
  // step anymore. PROPOSER_ACCEPTED/COUNTERPART_ACCEPTED (the old individual
  // per-party consent events this replaced) are retired, not reused for
  // anything else.
  ACCEPTED: 'ACCEPTED',
  // Payer uploads bukti transfer (attested)
  BUKTI_UPLOADED: 'BUKTI_UPLOADED',
  // Payee confirms receipt in-app
  RECEIPT_CONFIRMED: 'RECEIPT_CONFIRMED',
  // Recipient confirms fulfillment (goods delivered / loan repaid)
  FULFILLMENT_CONFIRMED: 'FULFILLMENT_CONFIRMED',
  // Cancellation paths
  CANCEL_AGREED: 'CANCEL_AGREED',
  CANCEL_UNILATERAL: 'CANCEL_UNILATERAL',
  // Seller/borrower uploads refund bukti
  REFUND_UPLOADED: 'REFUND_UPLOADED',
  // Buyer/lender confirms refund received
  REFUND_CONFIRMED: 'REFUND_CONFIRMED',
  // Buyer/lender confirms a partial refund received (mirrors REFUND_CONFIRMED)
  REFUND_CONFIRMED_PARTIAL: 'REFUND_CONFIRMED_PARTIAL',
  // System: deadline passed in an eligible status. Corrected 2026-07-20 (an
  // earlier version of this comment claimed DIKONFIRMASI_TERIMA was
  // deadline-driven and exempt from report-gating — wrong; verified against
  // content/legal/syarat-ketentuan.md §4.1, "pihak yang dirugikan *dapat*
  // mengajukan laporan" (the wronged party *may* file — optional, never
  // automatic). Gated on an actual breach report being filed, for BOTH
  // DIBAYAR_DIKLAIM (breachActions.ts's fileDeadlineLapseReport, migration
  // 0021) and DIKONFIRMASI_TERIMA (fileBarangTidakSesuaiReport, migration
  // 0020). The deadline sweep (Phase 6) never fires this event for either
  // state — that wiring belongs entirely to those two report-filing RPCs,
  // by design, not because it's unbuilt. See migration 0018's header
  // comment for the original reasoning.
  TENGGAT_LEWAT: 'TENGGAT_LEWAT',
  // Flagged party files hak jawab within 14-day window
  HAK_JAWAB_FILED: 'HAK_JAWAB_FILED',
  // System, build step 4 (migration 0023): fires at a single T+14-day
  // checkpoint from the original TENGGAT_LEWAT event — NOT a second
  // sequential silence timer starting from HAK_JAWAB_FILED (an earlier
  // version of this comment said "14-day hak jawab + 14-day sengketa
  // silence elapsed"; corrected after resolving a conflict against
  // copy-id.md §1's DISPUTED suffix, which is worded as permanent once a
  // response exists — a second silence window would eventually publish a
  // false "tidak merespons" sentence for a deal that has a real response on
  // record). Publishes the flag with the DISPUTED wording and demotes
  // SENGKETA back to TIDAK_DIPENUHI as the terminal resting status,
  // regardless of how long the dispute has otherwise been sitting. See
  // publish_flag_disputed_with_event.
  SENGKETA_KADALUARSA: 'SENGKETA_KADALUARSA',
  // System, build step 4 (migration 0023): the MENUNGGU-branch mirror of
  // SENGKETA_KADALUARSA above — same T+14-day-from-filing checkpoint, fired
  // when hak_jawab_status is still MENUNGGU at that point (nobody ever
  // responded). Self-transition on TIDAK_DIPENUHI. See
  // publish_flag_silent_with_event.
  FLAG_PUBLISHED: 'FLAG_PUBLISHED',
  // System: 30+ days of silence past deadline with no laporan ever filed —
  // quiet, no-blame terminal outcome. Reachable from both DIBAYAR_DIKLAIM
  // and DIKONFIRMASI_TERIMA (unified in the sweep, migration 0018); the two
  // source states stay distinguishable via whether RECEIPT_CONFIRMED
  // precedes this event in deal_events, without needing a second status.
  KEDALUWARSA_LAPSED: 'KEDALUWARSA_LAPSED',
  // Payee states that the claimed payment has not landed, or that the bukti
  // does not match this deal (migration 0029). Self-transition on
  // DIBAYAR_DIKLAIM — this is one party's account of events, recorded and
  // attributed, NOT a breach report: no flags row, no status change, no
  // publication. It sits alongside the payer's bukti claim so a reader can
  // see both sides and see that they disagree. Replaces the old
  // WA-nudge-only version of this action, which recorded nothing at all.
  DANA_BELUM_MASUK: 'DANA_BELUM_MASUK',
  // System: deadline sweep's WA reminder (T+2 days past deadline, DIBAYAR_DIKLAIM
  // or DIKONFIRMASI_TERIMA, once only). Self-transition — status unchanged.
  // Targets exactly one party (whichever is expected to act next), not both
  // — see runNudgeBranch in app/api/cron/deadline-sweep/route.ts.
  NUDGE_SENT: 'NUDGE_SENT',
} as const;
export type DealEventName = (typeof DealEventName)[keyof typeof DealEventName];

// null next = the deal record is deleted, not transitioned
type Transition = { event: DealEventName; next: DealStatus | null };

export const VALID_TRANSITIONS: Record<DealStatus, Transition[]> = {
  [DealStatus.DRAF]: [
    { event: DealEventName.COUNTERPART_JOINED, next: DealStatus.DIAJUKAN },
    // auto-delete by pg_cron after 7 days — not a named transition
  ],
  [DealStatus.DIAJUKAN]: [
    // 2026-07-20: fired automatically inside join_deal_with_event's own
    // transaction (migration 0025), immediately after COUNTERPART_JOINED —
    // not a separate manual step anymore. The gate that used to live in
    // finalize_deal_acceptance()'s guarded UPDATE now lives in
    // join_deal_with_event's single WHERE status = 'DRAF' guard instead; DIAJUKAN
    // is no longer a resting state joinDeal's callers can observe in the
    // normal path. Do not call assertTransition(DIAJUKAN, ACCEPTED) and write
    // the event/status yourself outside that RPC.
    { event: DealEventName.ACCEPTED, next: DealStatus.DISEPAKATI },
    { event: DealEventName.COUNTERPART_DECLINED, next: null }, // hard delete, unused today (no UI wires it)
  ],
  [DealStatus.DISEPAKATI]: [
    { event: DealEventName.BUKTI_UPLOADED, next: DealStatus.DIBAYAR_DIKLAIM },
    { event: DealEventName.CANCEL_AGREED, next: DealStatus.DIBATALKAN_BERSAMA },
    { event: DealEventName.CANCEL_UNILATERAL, next: DealStatus.TIDAK_DILANJUTKAN },
  ],
  [DealStatus.DIBAYAR_DIKLAIM]: [
    { event: DealEventName.RECEIPT_CONFIRMED, next: DealStatus.DIKONFIRMASI_TERIMA },
    { event: DealEventName.REFUND_UPLOADED, next: DealStatus.DIBAYAR_DIKLAIM }, // self; awaiting REFUND_CONFIRMED
    { event: DealEventName.REFUND_CONFIRMED, next: DealStatus.DIKEMBALIKAN_PENUH },
    { event: DealEventName.REFUND_CONFIRMED_PARTIAL, next: DealStatus.DIKEMBALIKAN_SEBAGIAN },
    { event: DealEventName.TENGGAT_LEWAT, next: DealStatus.TIDAK_DIPENUHI },
    { event: DealEventName.KEDALUWARSA_LAPSED, next: DealStatus.KEDALUWARSA },
    { event: DealEventName.NUDGE_SENT, next: DealStatus.DIBAYAR_DIKLAIM }, // self
    { event: DealEventName.DANA_BELUM_MASUK, next: DealStatus.DIBAYAR_DIKLAIM }, // self
  ],
  [DealStatus.DIKONFIRMASI_TERIMA]: [
    { event: DealEventName.FULFILLMENT_CONFIRMED, next: DealStatus.SELESAI },
    { event: DealEventName.TENGGAT_LEWAT, next: DealStatus.TIDAK_DIPENUHI },
    // New 2026-07-20: mirrors the DIBAYAR_DIKLAIM KEDALUWARSA_LAPSED edge —
    // unified quiet terminal outcome, sweep-driven, no report ever filed.
    { event: DealEventName.KEDALUWARSA_LAPSED, next: DealStatus.KEDALUWARSA },
    { event: DealEventName.NUDGE_SENT, next: DealStatus.DIKONFIRMASI_TERIMA }, // self
  ],
  [DealStatus.SELESAI]: [],
  [DealStatus.DIBATALKAN_BERSAMA]: [],
  [DealStatus.TIDAK_DILANJUTKAN]: [],
  [DealStatus.KEDALUWARSA]: [],
  [DealStatus.DIKEMBALIKAN_PENUH]: [],
  [DealStatus.DIKEMBALIKAN_SEBAGIAN]: [],
  [DealStatus.TIDAK_DIPENUHI]: [
    { event: DealEventName.HAK_JAWAB_FILED, next: DealStatus.SENGKETA },
    { event: DealEventName.FLAG_PUBLISHED, next: DealStatus.TIDAK_DIPENUHI }, // self
  ],
  [DealStatus.SENGKETA]: [
    { event: DealEventName.SENGKETA_KADALUARSA, next: DealStatus.TIDAK_DIPENUHI },
  ],
};

export class InvalidTransitionError extends Error {
  constructor(current: DealStatus, event: DealEventName) {
    super(`Invalid transition: ${event} from ${current}`);
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Validate and return the next status for a given transition.
 * Returns null when the transition means "delete the deal record" (COUNTERPART_DECLINED).
 * Returns the current status for self-transitions (REFUND_UPLOADED, NUDGE_SENT).
 * Throws InvalidTransitionError on illegal transitions.
 */
export function assertTransition(current: DealStatus, event: DealEventName): DealStatus | null {
  const allowed = VALID_TRANSITIONS[current];
  const match = allowed.find((t) => t.event === event);
  if (!match) throw new InvalidTransitionError(current, event);
  return match.next;
}
