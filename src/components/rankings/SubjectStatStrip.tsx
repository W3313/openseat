import clsx from "clsx";
import type { RankingsTotals } from "@/lib/domain/types";
import { formatGpa, formatNumber, pluralize } from "@/lib/utils/format";

export interface SubjectStatStripProps {
  subjectGpaMean: number | null;
  totals: RankingsTotals;
  seatStatusAvailable?: boolean;
  /** Grades-only schools have no review count to show. Default true. */
  reviewsAvailable?: boolean;
  className?: string;
}

/** "avg GPA 3.30 · 3 ranked · 3 open sections · 31 reviews" (pure; SPEC 3.2 item 2). Grades-only drops the reviews item. */
export function subjectStatItems(props: Omit<SubjectStatStripProps, "className">): string[] {
  const sectionsWord = props.seatStatusAvailable === false ? "offered section" : "open section";
  const items = [
    `avg GPA ${formatGpa(props.subjectGpaMean)}`,
    `${formatNumber(props.totals.ranked)} ranked`,
    pluralize(props.totals.openSections, sectionsWord),
  ];
  if (props.reviewsAvailable !== false) items.push(pluralize(props.totals.reviews, "review"));
  return items;
}

export function SubjectStatStrip({ className, ...rest }: SubjectStatStripProps) {
  const items = subjectStatItems(rest);
  return (
    <p className={clsx("m-0 flex flex-wrap items-center gap-x-1.5 text-sm text-ink-muted", className)} data-testid="subject-stat-strip">
      {items.map((item, i) => (
        <span key={item} className="inline-flex items-center gap-1.5 tabular-nums">
          {i > 0 ? (
            <span aria-hidden="true" className="text-ink-faint">
              ·
            </span>
          ) : null}
          {item}
        </span>
      ))}
    </p>
  );
}

export default SubjectStatStrip;
