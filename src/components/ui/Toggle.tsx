"use client";

import { useId, type ReactNode } from "react";
import clsx from "clsx";

export interface ToggleProps {
  /** Visible label text (also the accessible name via `aria-labelledby`). */
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Secondary line under the label, e.g. the live-mode seat caveat. */
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Rendered after the label (e.g. a `StatTooltip`); kept outside the switch. */
  hint?: ReactNode;
}

/**
 * Accessible switch: a `<button role="switch" aria-checked>` with a visible
 * label. Space/Enter toggle (native button behaviour); clicking the label
 * toggles too.
 */
export function Toggle({
  label,
  checked,
  onChange,
  description,
  disabled,
  id: idProp,
  className,
  hint,
}: ToggleProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const labelId = `${id}-label`;
  const descId = description ? `${id}-desc` : undefined;

  return (
    <div className={clsx("inline-flex items-start gap-2", className)}>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
          checked ? "border-brand bg-brand" : "border-border-strong bg-surface-sunken",
          "disabled:opacity-50",
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform dark:bg-ink",
            checked ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
      <span className="inline-flex flex-col leading-tight">
        <span className="inline-flex items-center gap-1">
          <label
            id={labelId}
            htmlFor={id}
            className={clsx("cursor-pointer text-sm font-medium text-ink", disabled && "opacity-50")}
          >
            {label}
          </label>
          {hint}
        </span>
        {description ? (
          <span id={descId} className="text-xs text-ink-muted">
            {description}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export default Toggle;
