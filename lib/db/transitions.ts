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
  // Both parties complete attestations and accept
  ACCEPTED: 'ACCEPTED',
  // Individual party consent toward ACCEPTED (self-transition; ACCEPTED itself
  // fires once both of these exist for a deal)
  PROPOSER_ACCEPTED: 'PROPOSER_ACCEPTED',
  COUNTERPART_ACCEPTED: 'COUNTERPART_ACCEPTED',
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
  // System: deadline passed in an eligible status
  TENGGAT_LEWAT: 'TENGGAT_LEWAT',
  // Flagged party files hak jawab within 14-day window
  HAK_JAWAB_FILED: 'HAK_JAWAB_FILED',
  // 14-day hak jawab + 14-day sengketa silence elapsed
  SENGKETA_KADALUARSA: 'SENGKETA_KADALUARSA',
  // System: 30 days of silence after a payment claim, no laporan ever filed
  KEDALUWARSA_LAPSED: 'KEDALUWARSA_LAPSED',
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
    // ACCEPTED here validates only the abstract graph edge (DIAJUKAN -> DISEPAKATI).
    // It does NOT check proposer_accepted/counterpart_accepted — that gate lives
    // in finalize_deal_acceptance()'s guarded UPDATE (the sole authority allowed
    // to actually fire this transition). Do not call assertTransition(DIAJUKAN,
    // ACCEPTED) and write the event/status yourself outside that RPC.
    { event: DealEventName.ACCEPTED, next: DealStatus.DISEPAKATI },
    { event: DealEventName.PROPOSER_ACCEPTED, next: DealStatus.DIAJUKAN },
    { event: DealEventName.COUNTERPART_ACCEPTED, next: DealStatus.DIAJUKAN },
    { event: DealEventName.COUNTERPART_DECLINED, next: null }, // hard delete
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
  ],
  [DealStatus.DIKONFIRMASI_TERIMA]: [
    { event: DealEventName.FULFILLMENT_CONFIRMED, next: DealStatus.SELESAI },
    { event: DealEventName.TENGGAT_LEWAT, next: DealStatus.TIDAK_DIPENUHI },
  ],
  [DealStatus.SELESAI]: [],
  [DealStatus.DIBATALKAN_BERSAMA]: [],
  [DealStatus.TIDAK_DILANJUTKAN]: [],
  [DealStatus.KEDALUWARSA]: [],
  [DealStatus.DIKEMBALIKAN_PENUH]: [],
  [DealStatus.DIKEMBALIKAN_SEBAGIAN]: [],
  [DealStatus.TIDAK_DIPENUHI]: [
    { event: DealEventName.HAK_JAWAB_FILED, next: DealStatus.SENGKETA },
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
 * Returns the current status for self-transitions (REFUND_UPLOADED, PROPOSER_ACCEPTED, COUNTERPART_ACCEPTED).
 * Throws InvalidTransitionError on illegal transitions.
 */
export function assertTransition(current: DealStatus, event: DealEventName): DealStatus | null {
  const allowed = VALID_TRANSITIONS[current];
  const match = allowed.find((t) => t.event === event);
  if (!match) throw new InvalidTransitionError(current, event);
  return match.next;
}
