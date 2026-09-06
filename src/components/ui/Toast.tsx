"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import clsx from "clsx";

export type ToastTone = "neutral" | "success" | "danger";

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  /** Milliseconds before auto-dismiss. */
  duration: number;
}

export interface ToastOptions {
  tone?: ToastTone;
  duration?: number;
}

/*
 * Tiny module-level store so `useToast()` works from any client component
 * without a provider. `<Toaster />` is mounted once in the root layout.
 */
type Listener = () => void;
let toasts: readonly ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return toasts;
}

const EMPTY: readonly ToastItem[] = [];
function getServerSnapshot() {
  return EMPTY;
}

/** Remove one toast. Exported for tests and for a manual close button. */
export function dismissToast(id: number) {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
  if (toasts.some((x) => x.id === id)) {
    toasts = toasts.filter((x) => x.id !== id);
    emit();
  }
}

/** Show a toast. Usable outside React too (e.g. from an event handler helper). */
export function toast(message: string, opts: ToastOptions = {}): number {
  const id = nextId++;
  const item: ToastItem = {
    id,
    message,
    tone: opts.tone ?? "neutral",
    duration: opts.duration ?? 3200,
  };
  // Keep at most 3 on screen; oldest drops first.
  toasts = [...toasts.slice(-2), item];
  emit();
  if (item.duration > 0) {
    timers.set(
      id,
      setTimeout(() => dismissToast(id), item.duration),
    );
  }
  return id;
}

/** Clear everything (tests). */
export function clearToasts() {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  toasts = [];
  emit();
}

export interface UseToast {
  toast: (message: string, opts?: ToastOptions) => number;
  dismiss: (id: number) => void;
  toasts: readonly ToastItem[];
}

/** Hook wrapper around the store. */
export function useToast(): UseToast {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const show = useCallback((message: string, opts?: ToastOptions) => toast(message, opts), []);
  return { toast: show, dismiss: dismissToast, toasts: items };
}

const TONE_CLASSES: Record<ToastTone, string> = {
  neutral: "bg-ink text-ink-inverse",
  success: "bg-success-soft text-success border border-success/30",
  danger: "bg-danger-soft text-danger border border-danger/30",
};

/**
 * Renders the toast stack. Mount exactly once (root layout). The region is a
 * polite live region so screen readers announce new messages without
 * stealing focus.
 */
export function Toaster({ className }: { className?: string }) {
  const { toasts: items, dismiss } = useToast();

  // Unmount safety: drop timers when the toaster goes away.
  useEffect(() => () => clearToasts(), []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className={clsx(
        "pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4",
        className,
      )}
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={clsx(
            "pointer-events-auto flex max-w-md items-center gap-3 rounded-lg px-4 py-2.5 text-sm shadow-overlay",
            TONE_CLASSES[t.tone],
          )}
        >
          <span>{t.message}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => dismiss(t.id)}
            className="ml-auto rounded px-1 text-xs opacity-80 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export default Toaster;
