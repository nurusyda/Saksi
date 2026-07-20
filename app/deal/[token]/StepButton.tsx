'use client';

import { useFormStatus } from 'react-dom';

// Shared submit button for the OTP-gated report modals (BarangTidakSesuaiModal,
// DeadlineLapseReportModal) — was duplicated verbatim between the two.
export function StepButton({
  label,
  pendingLabel,
  disabled = false,
}: {
  label: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="flex h-12 w-full items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
