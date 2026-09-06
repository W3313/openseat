import Link from "next/link";
import clsx from "clsx";
import type { DataMode } from "@/lib/domain/types";

export interface ModeBadgeProps {
  mode: DataMode;
  /** `School.shortName`, e.g. "UIUC" (used in live mode). */
  shortName: string;
  className?: string;
  /** Compact variant hides the long suffix on narrow screens. */
  compact?: boolean;
}

/** SPEC 3.0 text for each mode. Exported so tests and the OG image can reuse it. */
export function modeBadgeText(mode: DataMode, shortName: string): string {
  return mode === "demo"
    ? "DEMO DATA — fictional professors & reviews"
    : `LIVE DATA — ${shortName}`;
}

/**
 * Shown in the site header on every page (F11). Links to the disclosure
 * section of the methodology page.
 */
export function ModeBadge({ mode, shortName, className, compact = true }: ModeBadgeProps) {
  const text = modeBadgeText(mode, shortName);
  const [head, tail] = text.split(" — ");
  return (
    <Link
      href="/about#demo"
      aria-label={`${text}. Read how the data is produced.`}
      className={clsx(
        "inline-flex h-7 items-center gap-1.5 rounded-chip border px-2.5 text-xs font-semibold tracking-wide whitespace-nowrap",
        mode === "demo"
          ? "border-transparent bg-demo-soft text-demo"
          : "border-transparent bg-success-soft text-success",
        "hover:underline",
        className,
      )}
    >
      <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-current" />
      <span>{head}</span>
      {tail ? (
        <span className={clsx("font-normal", compact && "hidden sm:inline")}>— {tail}</span>
      ) : null}
    </Link>
  );
}

export default ModeBadge;
