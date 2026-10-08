"use client";

import { CloseIcon } from "@/components/icons";
import { useToastStore } from "@/store/toasts";

/**
 * Toast stack: top-center under the header, so it never covers the composer (or the reply bar)
 * at any width. The region is always mounted so screen readers announce new toasts politely.
 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed top-[calc(var(--spacing-header)+8px)] left-1/2 z-[60] flex w-toast max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col items-center gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex w-full items-center gap-2 rounded-toast bg-toast py-2 pr-1.5 pl-4 text-body-sm text-on-toast shadow-menu"
        >
          <p className="flex-1">{t.message}</p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
            className="flex size-6 shrink-0 items-center justify-center rounded-full opacity-70 hover:opacity-100"
          >
            <CloseIcon className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
