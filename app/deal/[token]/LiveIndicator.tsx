// Presentational-only sibling to WaitingStatusPoll (which stays headless).
// Split out so the polling logic and its visual affordance can be reasoned
// about separately — this renders a static, always-true claim ("this screen
// updates itself"), never a fabricated activity status like "sedang
// ditinjau", since there's no server-side signal for that.
export function LiveIndicator() {
  return (
    <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
      Diperbarui otomatis
    </span>
  );
}
