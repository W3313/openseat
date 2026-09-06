"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import clsx from "clsx";

export type TooltipPlacement = "top" | "bottom";

export interface TooltipProps {
  /** Tooltip body. Plain text or small inline markup; never HTML strings. */
  content: ReactNode;
  /**
   * The trigger. It must be focusable itself (a button, link or input) so the
   * tooltip is reachable from the keyboard; the wrapper adds `aria-describedby`.
   */
  children: ReactNode;
  placement?: TooltipPlacement;
  /** Extra classes for the wrapper `<span>`. */
  className?: string;
  /** Show the tooltip regardless of hover/focus (used by tests and StatTooltip). */
  open?: boolean;
}

/**
 * Hover/focus tooltip for elements that already have their own click behaviour
 * (e.g. a sort radio, a badge chip). For explanatory "what does this number
 * mean?" affordances use `StatTooltip`, which is a dedicated toggle button.
 *
 * Accessibility: the bubble has `role="tooltip"` and the trigger wrapper points
 * at it with `aria-describedby`, so screen readers announce the text on focus.
 * Escape hides it.
 */
export function Tooltip({ content, children, placement = "top", className, open }: TooltipProps) {
  const id = useId();
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const visible = open ?? ((hover || focus) && !dismissed);

  function onKeyDown(e: KeyboardEvent<HTMLSpanElement>) {
    if (e.key === "Escape" && visible) {
      setDismissed(true);
    }
  }

  // Escape-dismissal is forgotten once the pointer leaves / focus moves away,
  // so the next hover or focus shows the tooltip again.
  function leave() {
    setHover(false);
    if (!focus) setDismissed(false);
  }
  function blur() {
    setFocus(false);
    if (!hover) setDismissed(false);
  }

  return (
    <span
      className={clsx("relative inline-flex", className)}
      aria-describedby={id}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={leave}
      onFocus={() => setFocus(true)}
      onBlur={blur}
      onKeyDown={onKeyDown}
    >
      {children}
      <span
        role="tooltip"
        id={id}
        hidden={!visible}
        className={clsx(
          "pointer-events-none absolute left-1/2 z-40 w-max max-w-[16rem] -translate-x-1/2",
          "rounded-md border border-border bg-surface-overlay px-2.5 py-1.5 text-left text-xs leading-snug text-ink shadow-overlay",
          placement === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
        )}
      >
        {content}
      </span>
    </span>
  );
}

export default Tooltip;
