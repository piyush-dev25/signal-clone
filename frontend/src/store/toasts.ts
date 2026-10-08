import { create } from "zustand";

const DURATION_MS = 4_000;
const MAX_VISIBLE = 3;

export type Toast = { id: number; message: string };

type ToastState = {
  toasts: Toast[];
  show: (message: string) => void;
  dismiss: (id: number) => void;
};

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],

  show: (message) => {
    const id = nextId++;
    timers.set(
      id,
      setTimeout(() => get().dismiss(id), DURATION_MS),
    );
    set((state) => {
      const toasts = [...state.toasts, { id, message }];
      // Keep the newest few; the oldest go early.
      for (const dropped of toasts.slice(0, Math.max(0, toasts.length - MAX_VISIBLE))) {
        clearTimeout(timers.get(dropped.id));
        timers.delete(dropped.id);
      }
      return { toasts: toasts.slice(-MAX_VISIBLE) };
    });
  },

  dismiss: (id) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));

/** Show a short message (auto-dismisses after ~4s). Usable outside React. */
export function toast(message: string): void {
  useToastStore.getState().show(message);
}
