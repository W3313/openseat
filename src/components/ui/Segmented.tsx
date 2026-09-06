"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import clsx from "clsx";

export interface SegmentedOption<V extends string> {
  value: V;
  label: ReactNode;
  /** Accessible name when `label` is not plain text. */
  ariaLabel?: string;
  /**
   * Rendered next to (not inside) the radio — e.g. a `StatTooltip`. Kept
   * outside the radio because a button may not contain another button.
   */
  hint?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<V extends string> {
  /** Accessible name of the group, e.g. "Sort by". */
  label: string;
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Segmented control implemented as a `role="radiogroup"` of `role="radio"`
 * buttons with a roving tabindex: Tab lands on the selected option, arrow keys
 * move and select, Home/End jump.
 */
export function Segmented<V extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
  className,
}: SegmentedProps<V>) {
  const refs = useRef<Map<V, HTMLButtonElement>>(new Map());

  function focusAndSelect(index: number) {
    const enabled = options.filter((o) => !o.disabled);
    if (enabled.length === 0) return;
    const wrapped = (index + enabled.length) % enabled.length;
    const opt = enabled[wrapped];
    onChange(opt.value);
    refs.current.get(opt.value)?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, current: V) {
    const enabled = options.filter((o) => !o.disabled);
    const idx = enabled.findIndex((o) => o.value === current);
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        focusAndSelect(idx + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        focusAndSelect(idx - 1);
        break;
      case "Home":
        e.preventDefault();
        focusAndSelect(0);
        break;
      case "End":
        e.preventDefault();
        focusAndSelect(enabled.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={clsx(
        "inline-flex max-w-full items-stretch rounded-lg border border-border bg-surface-sunken p-0.5",
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <span key={opt.value} className="inline-flex items-center">
            <button
              ref={(el) => {
                if (el) refs.current.set(opt.value, el);
                else refs.current.delete(opt.value);
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={opt.ariaLabel}
              tabIndex={selected ? 0 : -1}
              disabled={opt.disabled}
              onClick={() => onChange(opt.value)}
              onKeyDown={(e) => onKeyDown(e, opt.value)}
              className={clsx(
                "rounded-md font-medium whitespace-nowrap transition-colors",
                size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-sm",
                selected
                  ? "bg-surface-raised text-ink shadow-card"
                  : "text-ink-muted hover:text-ink",
                "disabled:opacity-50",
              )}
            >
              {opt.label}
            </button>
            {opt.hint ? <span className="ml-0.5 mr-1 inline-flex">{opt.hint}</span> : null}
          </span>
        );
      })}
    </div>
  );
}

export default Segmented;
