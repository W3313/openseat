import Link from "next/link";
import clsx from "clsx";
import type { SchoolAttribution } from "./schoolFlags";

export interface DataBadgeProps {
  /** `School.attribution` — the grades clause is the accessible name / title (full sentence). */
  attribution: Pick<SchoolAttribution, "grades">;
  /** Visible suffix ("· UIUC"); the registry attribution is a full sentence and would overflow the header. */
  shortName?: string;
  className?: string;
  /** Compact variant hides the suffix on narrow screens. */
  compact?: boolean;
}

/** Design §8: "Official grade data · <attribution>". Exported so tests and the OG image can reuse it. */
export function dataBadgeText(attribution: Pick<SchoolAttribution, "grades">): string {
  return `Official grade data · ${attribution.grades}`;
}

/**
 * Header badge for a real school (design §8) — the counterpart of `ModeBadge`, which is reserved for
 * `demo`. The visible text stays short (label + school); the full attribution is the tooltip and the
 * accessible name, and the footer prints it in full. Links to the per-school sources table.
 */
export function DataBadge({ attribution, shortName, className, compact = true }: DataBadgeProps) {
  const text = dataBadgeText(attribution);
  return (
    <Link
      href="/about#sources"
      aria-label={`${text}. Read where the data comes from.`}
      title={text}
      data-testid="data-badge"
      className={clsx(
        "inline-flex h-7 items-center gap-1.5 rounded-chip border border-transparent bg-success-soft px-2.5 text-xs font-semibold tracking-wide whitespace-nowrap text-success hover:underline",
        className,
      )}
    >
      <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-current" />
      <span>Official grade data</span>
      {shortName ? <span className={clsx("font-normal", compact && "hidden sm:inline")}>· {shortName}</span> : null}
    </Link>
  );
}

export default DataBadge;
