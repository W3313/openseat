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
  className?: string;
}

/**
 * Collapsed "Not enough reviews yet (n)" group (SPEC F8 / 3.2 item 6): compact
 * rows for professors under `MIN_REVIEWS_RANKED` reviews, grades-only included.
 */
export function LowDataGroup({ items, schoolId, seatStatusAvailable = true, className }: LowDataGroupProps) {
  if (items.length === 0) return null;
  const sectionsWord = seatStatusAvailable ? "open section" : "offered section";
  return (
    <details className={clsx("rounded-card border border-border bg-surface-sunken/60", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
        <span>
          {TOOLTIPS.stats.lowData.label} ({items.length})
        </span>
        <StatTooltip label="Why are these professors not ranked?" content={TOOLTIPS.stats.lowData.text} />
        <span className="ml-auto text-xs font-normal text-ink-muted">under {MIN_REVIEWS_RANKED} reviews</span>
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
              {professor.kind === "grades-only" ? <span className="text-[0.65rem] uppercase tracking-wide text-ink-faint">grades only</span> : null}
              <span className="text-xs text-ink-muted">{pluralize(scores.reviewCount, "review")}</span>
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
