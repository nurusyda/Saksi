export const DealStatus = {
  DRAF: 'DRAF',
  DIAJUKAN: 'DIAJUKAN',
  DISEPAKATI: 'DISEPAKATI',
  DIBAYAR_DIKLAIM: 'DIBAYAR_DIKLAIM',
  DIKONFIRMASI_TERIMA: 'DIKONFIRMASI_TERIMA',
  SELESAI: 'SELESAI',
  DIBATALKAN_BERSAMA: 'DIBATALKAN_BERSAMA',
  DIBATALKAN_SEPIHAK_PRA_BAYAR: 'DIBATALKAN_SEPIHAK_PRA_BAYAR',
  DIKEMBALIKAN_PENUH: 'DIKEMBALIKAN_PENUH',
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
  // Deadline extension (self-transition — status unchanged)
  PERPANJANGAN_PROPOSED: 'PERPANJANGAN_PROPOSED',
  PERPANJANGAN_ACCEPTED: 'PERPANJANGAN_ACCEPTED',
  // System: deadline passed in an eligible status
  TENGGAT_LEWAT: 'TENGGAT_LEWAT',
  // Flagged party files hak jawab within 14-day window
  HAK_JAWAB_FILED: 'HAK_JAWAB_FILED',
  // 14-day hak jawab + 14-day sengketa silence elapsed
  SENGKETA_KADALUARSA: 'SENGKETA_KADALUARSA',
} as const;
export type DealEventName = (typeof DealEventName)[keyof typeof DealEventName];

// null next = the deal record is deleted, not transitioned
type Transition = { event: DealEventName; next: DealStatus | null };

// Self-transitions (status unchanged; valid from multiple states)
const PERPANJANGAN_TRANSITIONS: Transition[] = [
  { event: DealEventName.PERPANJANGAN_PROPOSED, next: null }, // null = same state (handled below)
  { event: DealEventName.PERPANJANGAN_ACCEPTED, next: null },
];

// For self-transitions, null next means "keep current status"
export const VALID_TRANSITIONS: Record<DealStatus, Transition[]> = {
  [DealStatus.DRAF]: [
    { event: DealEventName.COUNTERPART_JOINED, next: DealStatus.DIAJUKAN },
    // auto-delete by pg_cron after 7 days — not a named transition
  ],
  [DealStatus.DIAJUKAN]: [
    { event: DealEventName.ACCEPTED, next: DealStatus.DISEPAKATI },
    { event: DealEventName.COUNTERPART_DECLINED, next: null }, // hard delete
  ],
  [DealStatus.DISEPAKATI]: [
    { event: DealEventName.BUKTI_UPLOADED, next: DealStatus.DIBAYAR_DIKLAIM },
    { event: DealEventName.CANCEL_AGREED, next: DealStatus.DIBATALKAN_BERSAMA },
    { event: DealEventName.CANCEL_UNILATERAL, next: DealStatus.DIBATALKAN_SEPIHAK_PRA_BAYAR },
    { event: DealEventName.PERPANJANGAN_PROPOSED, next: DealStatus.DISEPAKATI },
    { event: DealEventName.PERPANJANGAN_ACCEPTED, next: DealStatus.DISEPAKATI },
  ],
  [DealStatus.DIBAYAR_DIKLAIM]: [
    { event: DealEventName.RECEIPT_CONFIRMED, next: DealStatus.DIKONFIRMASI_TERIMA },
    { event: DealEventName.REFUND_UPLOADED, next: DealStatus.DIBAYAR_DIKLAIM }, // self; awaiting REFUND_CONFIRMED
    { event: DealEventName.REFUND_CONFIRMED, next: DealStatus.DIKEMBALIKAN_PENUH },
    { event: DealEventName.TENGGAT_LEWAT, next: DealStatus.TIDAK_DIPENUHI },
    { event: DealEventName.PERPANJANGAN_PROPOSED, next: DealStatus.DIBAYAR_DIKLAIM },
    { event: DealEventName.PERPANJANGAN_ACCEPTED, next: DealStatus.DIBAYAR_DIKLAIM },
  ],
  [DealStatus.DIKONFIRMASI_TERIMA]: [
    { event: DealEventName.FULFILLMENT_CONFIRMED, next: DealStatus.SELESAI },
    { event: DealEventName.TENGGAT_LEWAT, next: DealStatus.TIDAK_DIPENUHI },
    { event: DealEventName.PERPANJANGAN_PROPOSED, next: DealStatus.DIKONFIRMASI_TERIMA },
    { event: DealEventName.PERPANJANGAN_ACCEPTED, next: DealStatus.DIKONFIRMASI_TERIMA },
  ],
  [DealStatus.SELESAI]: [],
  [DealStatus.DIBATALKAN_BERSAMA]: [],
  [DealStatus.DIBATALKAN_SEPIHAK_PRA_BAYAR]: [],
  [DealStatus.DIKEMBALIKAN_PENUH]: [],
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
 * Returns the current status for self-transitions (PERPANJANGAN_*, REFUND_UPLOADED).
 * Throws InvalidTransitionError on illegal transitions.
 */
export function assertTransition(current: DealStatus, event: DealEventName): DealStatus | null {
  const allowed = VALID_TRANSITIONS[current];
  const match = allowed.find((t) => t.event === event);
  if (!match) throw new InvalidTransitionError(current, event);
  return match.next;
}
