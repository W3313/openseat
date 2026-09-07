import Link from "next/link";
import clsx from "clsx";
import type { RankedProfessor } from "@/lib/domain/types";
import { MIN_REVIEWS_RANKED } from "@/lib/domain/constants";
import { TOOLTIPS } from "@/lib/copy/tooltips";
import { StatTooltip } from "@/components/ui/StatTooltip";
import { DeltaChip } from "@/components/professor/DeltaChip";
import { buildProfessorHref } from "@/lib/utils/urlState";
import { pluralize } from "@/lib/utils/format";

export interface LowDataGroupProps {
  items: readonly RankedProfessor[];
  schoolId: string;
  seatStatusAvailable?: boolean;
  /**
   * Grades-only schools (design §5) rank everyone with grade rows, so this group holds instructors
   * with no grade data at all and reads "No grade data yet" instead of "Not enough reviews yet". Default true.
   */
  reviewsAvailable?: boolean;
  className?: string;
}

/** Group heading for the mode: "Not enough reviews yet" | "No grade data yet". */
export function lowDataHeading(reviewsAvailable = true): { label: string; text: string; note: string | null } {
  return reviewsAvailable
    ? { label: TOOLTIPS.stats.lowData.label, text: TOOLTIPS.stats.lowData.text, note: `under ${MIN_REVIEWS_RANKED} reviews` }
    : { label: TOOLTIPS.stats.lowDataGradesOnly.label, text: TOOLTIPS.stats.lowDataGradesOnly.text, note: null };
}

/**
 * Collapsed "Not enough reviews yet (n)" group (SPEC F8 / 3.2 item 6): compact
 * rows for professors under `MIN_REVIEWS_RANKED` reviews, grades-only included.
 */
export function LowDataGroup({ items, schoolId, seatStatusAvailable = true, reviewsAvailable = true, className }: LowDataGroupProps) {
  if (items.length === 0) return null;
  const sectionsWord = seatStatusAvailable ? "open section" : "offered section";
  const heading = lowDataHeading(reviewsAvailable);
  return (
    <details className={clsx("rounded-card border border-border bg-surface-sunken/60", className)} data-testid="low-data-group">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
        <span>
          {heading.label} ({items.length})
        </span>
        <StatTooltip label="Why are these professors not ranked?" content={heading.text} />
        {heading.note ? <span className="ml-auto text-xs font-normal text-ink-muted">{heading.note}</span> : null}
      </summary>
      <ul className="m-0 flex list-none flex-col divide-y divide-border border-t border-border p-0">
        {items.map((item) => {
          const { professor, scores } = item;
          return (
            <li key={professor.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
              <Link href={buildProfessorHref(schoolId, professor.slug)} className="font-medium text-ink hover:underline">
                {professor.displayName}
              </Link>
              {professor.isFictional ? <span className="text-[0.65rem] uppercase tracking-wide text-demo">fictional</span> : null}
              {reviewsAvailable && professor.kind === "grades-only" ? (
                <span className="text-[0.65rem] uppercase tracking-wide text-ink-faint">grades only</span>
              ) : null}
              {reviewsAvailable ? <span className="text-xs text-ink-muted">{pluralize(scores.reviewCount, "review")}</span> : null}
              {scores.studentsGraded > 0 ? (
                <DeltaChip scores={scores} size="sm" />
              ) : (
                <span className="text-xs text-ink-faint">{TOOLTIPS.stats.noGradeData.label}</span>
              )}
              <span className="text-xs text-ink-muted">{pluralize(item.openSections.length, sectionsWord)}</span>
              <Link href={buildProfessorHref(schoolId, professor.slug)} className="ml-auto text-xs font-medium text-link hover:underline">
                View profile →
              </Link>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export default LowDataGroup;
