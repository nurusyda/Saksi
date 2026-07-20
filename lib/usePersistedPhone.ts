'use client';

import { useSyncExternalStore } from 'react';

// UX-audit fix pass (2026-07-20) — every post-agreement screen re-asks for
// the same phone number via IdentifyPartyGate (no session exists in this
// app; see that component's own doc comment), so a party revisiting the deal
// mid-flow retypes their phone 3-4 times over the lifecycle. This only
// prefills the field from the browser's own sessionStorage as a convenience
// default; the server still independently re-verifies whatever value is
// actually submitted (identifyPartyByPhone), so a stale or wrong prefill
// carries no more trust than a hand-typed one — this never becomes an
// identity claim on its own.
//
// useSyncExternalStore rather than useState(getStoredPhone) + an effect:
// these components are server-rendered on the initial request (Next.js
// still SSRs 'use client' components, hence hydration), and the server has
// no window/sessionStorage. useSyncExternalStore's getServerSnapshot
// parameter exists specifically to give a consistent value for that SSR
// pass ('') while getSnapshot reads the real stored value on the client —
// no hydration-mismatch warning, and no setState-in-effect to reconcile.
const STORAGE_KEY = 'saksi_phone';
const listeners = new Set<() => void>();

function getStoredPhone(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    // Storage disabled (private browsing, quota, etc.) — fall back to empty,
    // same as a first-time visitor.
    return '';
  }
}

function setStoredPhone(phone: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, phone);
  } catch {
    // No-op — this is a convenience prefill, not load-bearing.
  }
  listeners.forEach((l) => l());
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function getServerSnapshot(): string {
  return '';
}

export function usePersistedPhone(): [string, (phone: string) => void] {
  const phone = useSyncExternalStore(subscribe, getStoredPhone, getServerSnapshot);
  return [phone, setStoredPhone];
}
