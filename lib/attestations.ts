import { ATTESTATIONS } from './copy';

// The client disables the T&C checkbox until all 4 AttestationChecklist boxes
// are individually ticked (copy-id.md §3, §32), but that's a UI gate only —
// a hand-crafted POST could still submit attest_tc=on alone. Re-check the 4
// individual attest_N fields server-side so consent can't be bypassed by
// skipping the client entirely (caught in monster_check review, 2026-08-01).
export function hasAllAttestations(formData: FormData): boolean {
  return ATTESTATIONS.every((_, i) => formData.get(`attest_${i}`) === 'on');
}
