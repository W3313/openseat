import clsx from "clsx";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** Primary action label, e.g. "Include closed sections". */
  actionLabel?: string;
  onAction?: () => void;
  /** Secondary link-shaped action. */
  secondaryHref?: string;
  secondaryLabel?: string;
  className?: string;
}

/** "Nothing open in {CODE} right now — include closed sections?" (SPEC 3.2 item 4). */
export function emptyRankingsTitle(code: string, seatStatusAvailable = true): string {
  return seatStatusAvailable
    ? `Nothing open in ${code} right now — include closed sections?`
    : `Nothing offered in ${code} this term — include all sections?`;
}

/**
 * Generic empty result panel (rankings, compare). The action is a real button
 * so tests and keyboards can drive it.
 */
export function EmptyState({ title, description, actionLabel, onAction, secondaryHref, secondaryLabel, className }: EmptyStateProps) {
  return (
    <section
      role="status"
      aria-live="polite"
      className={clsx(
        "flex flex-col items-start gap-3 rounded-card border border-dashed border-border-strong bg-surface-sunken/60 p-5 sm:p-6",
        className,
      )}
    >
      <h2 className="m-0 text-base font-semibold text-ink">{title}</h2>
      {description ? <p className="m-0 text-sm text-ink-muted">{description}</p> : null}
      {(actionLabel && onAction) || (secondaryHref && secondaryLabel) ? (
        <div className="flex flex-wrap gap-2">
          {actionLabel && onAction ? (
            <Button size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          ) : null}
          {secondaryHref && secondaryLabel ? (
            <Button size="sm" variant="secondary" href={secondaryHref}>
              {secondaryLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default EmptyState;
