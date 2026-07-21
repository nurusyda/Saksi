'use client';

import { useSyncExternalStore } from 'react';

// ============================================================
// The seller's own list of tagihan they created, stored on their device.
//
// Why device-local and not a phone lookup. Identity in this app is a phone
// number with no account and no login (see identifyPartyByPhone), and a deal
// token is a *capability*: whoever holds it can open the deal, read the
// rekening, upload a bukti, file a dispute. A "type your phone, get your
// deals" page would therefore hand out capabilities to anyone who typed a
// number — an enumeration oracle far worse than the count-only one /cek
// already accepts, because the payload is access rather than statistics.
// Proving possession of the phone would fix that, and proving it needed the
// OTP that §25 removed for good reasons. So until there is real auth, the
// only safe key for "my deals" is the device that created them.
//
// What this does and does not solve. It solves the common case of the
// "lost link = lost deal" problem: a seller who creates tagihan on their
// phone and later cannot find the WhatsApp message still has them here. It
// does NOT survive a different device, a cleared browser, or private
// browsing — and the page says so plainly rather than implying this is an
// account. The link itself remains the durable capability; this is a
// convenience index over links this browser has already seen.
//
// Nothing here is trusted server-side. The dashboard sends these tokens to a
// read action that returns only what the deal page would already show to
// anyone holding the same token, so a forged or edited localStorage entry
// gains its author exactly nothing.
//
// useSyncExternalStore for the same reason usePersistedPhone uses it: these
// components are server-rendered first, and the server has no localStorage —
// getServerSnapshot supplies a stable [] for that pass with no hydration
// mismatch and no setState-in-effect.
// ============================================================

const STORAGE_KEY = 'saksi_my_deals';
const MAX_ENTRIES = 100;

export interface StoredDeal {
  token: string;
  itemDesc: string;
  amountIdr: number;
  /** ISO timestamp of when this browser first recorded the deal. */
  savedAt: string;
}

const listeners = new Set<() => void>();

// Cached so getSnapshot returns a referentially stable value between writes.
// useSyncExternalStore re-invokes getSnapshot on every render and will loop
// forever if it keeps receiving a fresh array identity.
let cache: StoredDeal[] | null = null;
let cacheRaw: string | null = null;

function readRaw(): string {
  if (typeof window === 'undefined') return '[]';
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '[]';
  } catch {
    return '[]';
  }
}

function getStoredDeals(): StoredDeal[] {
  const raw = readRaw();
  if (raw === cacheRaw && cache) return cache;
  let parsed: StoredDeal[] = [];
  try {
    const value: unknown = JSON.parse(raw);
    if (Array.isArray(value)) {
      parsed = value.filter(
        (d): d is StoredDeal =>
          typeof d === 'object' && d !== null && typeof (d as StoredDeal).token === 'string',
      );
    }
  } catch {
    // Corrupt or hand-edited storage — treat as empty rather than throwing.
    parsed = [];
  }
  cacheRaw = raw;
  cache = parsed;
  return parsed;
}

function write(deals: StoredDeal[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deals.slice(0, MAX_ENTRIES)));
  } catch {
    // Storage full or disabled — this is an index over links the seller
    // already has, never the only copy, so failing to write is survivable.
  }
  cacheRaw = null;
  listeners.forEach((l) => l());
}

/** Idempotent: re-recording a token this browser already has is a no-op. */
export function rememberDeal(deal: StoredDeal): void {
  const existing = getStoredDeals();
  if (existing.some((d) => d.token === deal.token)) return;
  write([deal, ...existing]);
}

export function forgetDeal(token: string): void {
  write(getStoredDeals().filter((d) => d.token !== token));
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

const EMPTY: StoredDeal[] = [];
function getServerSnapshot(): StoredDeal[] {
  return EMPTY;
}

export function useMyDeals(): StoredDeal[] {
  return useSyncExternalStore(subscribe, getStoredDeals, getServerSnapshot);
}
