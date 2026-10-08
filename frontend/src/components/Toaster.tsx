"use client";

import { CloseIcon } from "@/components/icons";
import { useToastStore } from "@/store/toasts";

/**
 * Toast stack: top-center, one header height (+ a gap) down, so it never covers the composer or
 * reply bar, nor a full-screen dialog's title row on phones. The region is always mounted so
 * screen readers announce new toasts politely.
 *
 * Each toast fits its text (up to --spacing-toast wide, 16px from the screen edges). The close
 * button sits absolutely at the right edge and the padding is the same on both sides, so the
 * text stays visually centered.
 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 top-[calc(var(--spacing-header)+var(--spacing-toast-gap))] z-60 flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto relative flex w-fit max-w-toast items-center justify-center rounded-toast bg-toast px-[calc(var(--spacing-toast-x)+var(--spacing-toast-close))] py-toast-y text-center text-body-sm text-on-toast shadow-menu"
        >
          <p>{t.message}</p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
            className="absolute top-1/2 right-[calc(var(--spacing-toast-x)/2)] flex size-toast-close -translate-y-1/2 items-center justify-center rounded-full opacity-70 hover:opacity-100"
          >
            <CloseIcon className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
