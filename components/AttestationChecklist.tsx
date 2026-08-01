'use client';

import { ATTESTATIONS, ATTEST_CHECK_ALL_LABEL, ATTEST_UNCHECK_ALL_LABEL } from '@/lib/copy';

// copy-id.md §3 requires the 4 attestations as individual, not-bundleable
// checkboxes. Shipped for a while as static <li> text under one bundled T&C
// checkbox instead (caught in the 2026-08-01 supervisor audit) — this
// restores 4 real per-item checkboxes. The "check all" button is a UX
// shortcut, not a bundling mechanism: it flips all 4 booleans in one tap but
// each stays individually inspectable/uncheckable afterward, so a reader who
// disagrees with one item can still uncheck just that one.
export function AttestationChecklist({
  checked,
  onChange,
}: {
  checked: boolean[];
  onChange: (next: boolean[]) => void;
}) {
  const allChecked = checked.every(Boolean);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-zinc-800">Pernyataan</span>
        <button
          type="button"
          onClick={() => onChange(checked.map(() => !allChecked))}
          className="text-xs font-medium text-witness hover:underline"
        >
          {allChecked ? ATTEST_UNCHECK_ALL_LABEL : ATTEST_CHECK_ALL_LABEL}
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {ATTESTATIONS.map((text, i) => (
          <li key={i}>
            <label className="flex items-start gap-3 text-xs leading-relaxed text-zinc-600">
              <input
                type="checkbox"
                name={`attest_${i}`}
                checked={checked[i]}
                onChange={() => onChange(checked.map((v, j) => (j === i ? !v : v)))}
                className="mt-0.5 shrink-0 accent-[var(--witness)]"
              />
              <span>{text}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function allAttested(checked: boolean[]): boolean {
  return checked.length === ATTESTATIONS.length && checked.every(Boolean);
}
