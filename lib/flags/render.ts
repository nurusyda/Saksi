// Pure rendering of a published flags row into the exact locked copy-id.md
// §1 strings — no I/O, no DB access, so it's usable from both a future
// public check-page component (B5) and any internal preview/testing
// without duplicating composition logic. Callers are responsible for only
// invoking this on a flags row where published_at is actually set (see
// migration 0023's publish_flag_silent_with_event /
// publish_flag_disputed_with_event) — this module has no opinion on
// whether something *should* be public, only on what it says once it is.

import { formatDate } from '@/lib/format';
import {
  FLAG_RUNG_LINES,
  formatFlagBodyStem,
  FLAG_TAIL_SILENT,
  FLAG_TAIL_DISPUTED,
  FLAG_EVIDENCE_SUB_LINE,
} from '@/lib/copy';

export type FlagTier = 'GRATIS' | 'LIMA_RIBU' | 'BERMETERAI';
export type FlagRung = 0 | 1 | 2;

export interface RenderFlagInput {
  rung: FlagRung;
  tier: FlagTier;
  // ISO timestamp of the originating TENGGAT_LEWAT event — the [tgl] in
  // every tier template (copy-id.md §7's convention: date of the specific
  // transition being recorded, not today's date).
  filedAtIso: string;
  // Whether the flagged party ever filed HAK_JAWAB_FILED (DISPUTED is
  // permanent once true, per the 2026-07-20 decision recorded in
  // lib/db/transitions.ts's SENGKETA_KADALUARSA comment — there is no
  // "responded, then went silent" case that reverts to the silent tail).
  disputed: boolean;
  hasEvidence: boolean;
}

export interface RenderedFlag {
  rungLine: string;
  body: string;
  evidenceLine: string | null;
}

export function renderFlag(input: RenderFlagInput): RenderedFlag {
  const tgl = formatDate(input.filedAtIso);
  const stem = formatFlagBodyStem(input.tier, tgl);
  const tail = input.disputed ? FLAG_TAIL_DISPUTED : FLAG_TAIL_SILENT;

  return {
    rungLine: FLAG_RUNG_LINES[input.rung],
    body: `${stem} ${tail}`,
    evidenceLine: input.disputed && input.hasEvidence ? FLAG_EVIDENCE_SUB_LINE : null,
  };
}
