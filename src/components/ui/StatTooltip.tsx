"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import clsx from "clsx";

export interface StatTooltipProps {
  /** Plain-English explanation (from `src/lib/copy/tooltips.ts`). Text only. */
  content: ReactNode;
  /**
   * Accessible name of the trigger, e.g. "What does shrunk rating mean?".
   * Required because the default trigger is an icon.
   */
  label: string;
  /**
   * Optional visible trigger content (e.g. the stat itself: "4.6 ★"). When
   * omitted an "i" glyph is rendered.
   */
  children?: ReactNode;
  placement?: "top" | "bottom";
  className?: string;
  /** Extra classes for the bubble. */
  bubbleClassName?: string;
  /** Controlled open state (optional). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * SPEC 3.0: `StatTooltip` is a `<button aria-describedby>` that toggles on
 * click/focus (tap on touch), and closes on Escape, blur or an outside click.
 * Opening on focus means keyboard users read the explanation as they tab
 * through the stats; clicking toggles so pointer users can pin it open.
 */
export function StatTooltip({
  content,
  label,
  children,
  placement = "top",
  className,
  bubbleClassName,
  open: openProp,
  onOpenChange,
}: StatTooltipProps) {
  const id = useId();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const rootRef = useRef<HTMLSpanElement>(null);
  // Suppresses the focus->open that immediately follows a mousedown, so a
  // pointer click on a closed trigger opens once instead of open+toggle.
  const pointerDownRef = useRef(false);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onDocKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [open, setOpen]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <span ref={rootRef} className={clsx("relative inline-flex", className)}>
      <button
        type="button"
        aria-describedby={id}
        aria-expanded={open}
        aria-label={children ? undefined : label}
        title={children ? label : undefined}
        className={clsx(
          "inline-flex items-center gap-1 rounded-md text-inherit",
          children
            ? "cursor-help underline decoration-dotted decoration-ink-faint underline-offset-2 hover:decoration-ink"
            : "h-5 w-5 justify-center rounded-full border border-border-strong text-[0.65rem] font-semibold leading-none text-ink-muted hover:bg-surface-sunken hover:text-ink",
        )}
        onPointerDown={() => {
          pointerDownRef.current = true;
        }}
        onClick={() => {
          pointerDownRef.current = false;
          setOpen(!open);
        }}
        onFocus={() => {
          if (pointerDownRef.current) return;
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      >
        {children ?? (
          <span aria-hidden="true" className="font-serif italic">
            i
          </span>
        )}
      </button>
      <span
        role="tooltip"
        id={id}
        hidden={!open}
        className={clsx(
          "absolute left-1/2 z-40 w-max max-w-[18rem] -translate-x-1/2",
          "rounded-md border border-border bg-surface-overlay px-3 py-2 text-left text-xs font-normal leading-snug text-ink shadow-overlay",
          placement === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          bubbleClassName,
        )}
      >
        {content}
      </span>
    </span>
  );
}

export default StatTooltip;
