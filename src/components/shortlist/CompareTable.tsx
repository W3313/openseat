import Link from "next/link";
import clsx from "clsx";
import type { ProfessorDetail, School } from "@/lib/domain/types";
import { buildProfessorHref } from "@/lib/utils/urlState";
import { courseLabelFromId } from "@/lib/utils/ids";
import { formatDelta, formatGpa, formatNumber, formatPct, formatRate, formatRating } from "@/lib/utils/format";
import { TOOLTIPS } from "@/lib/copy/tooltips";
import { Chip } from "@/components/ui/Chip";
import { StatTooltip } from "@/components/ui/StatTooltip";
import { ConfidenceDots } from "@/components/professor/ConfidenceDots";
import { BadgeRow } from "@/components/professor/BadgeRow";
import { VibeTags } from "@/components/professor/VibeTags";
import { StatusChip } from "@/components/professor/StatusChip";
import { sortSections } from "@/components/professor/OpenSectionsTable";
import { bestIndexes, numericRowsFor, openSectionCount, type NumericRowDef } from "./compareRows";
import { resolveSchoolFlags, type SchoolLike } from "@/components/layout/schoolFlags";

export interface CompareTableProps {
  details: readonly ProfessorDetail[];
  school: Pick<School, "id" | "seatStatusAvailable"> & SchoolLike;
  className?: string;
}

/** Highlight classes for the best cell in a row (SPEC 3.5). */
export const BEST_CELL_CLASS = "bg-emerald-50 dark:bg-emerald-950";

const TOOLTIP_FOR: Record<NumericRowDef["key"], { label: string; text: string }> = {
  rating: TOOLTIPS.stats.ratingShrunk,
  reviews: TOOLTIPS.stats.reviewCount,
  wouldTakeAgain: TOOLTIPS.stats.wouldTakeAgain,
  difficulty: TOOLTIPS.stats.difficulty,
  gpa: TOOLTIPS.stats.gpaMean,
  delta: TOOLTIPS.stats.gpaDelta,
  wRate: TOOLTIPS.stats.wRate,
  openSections: TOOLTIPS.stats.openSections,
};

function formatCell(row: NumericRowDef, detail: ProfessorDetail): string {
  const v = row.value(detail);
  switch (row.key) {
    case "rating":
      return v == null ? "—" : `${formatRating(v)} ★`;
    case "reviews":
    case "openSections":
      return formatNumber(v ?? 0);
    case "wouldTakeAgain":
      return formatPct(v);
    case "difficulty":
      return v == null ? "—" : v.toFixed(1);
    case "gpa":
      return formatGpa(v);
    case "delta":
      if (v != null) return formatDelta(v);
      return detail.scores.soleInstructor ? "only instructor" : "—";
    case "wRate":
      return formatRate(v);
  }
}

function tooltipText(row: NumericRowDef): string {
  // Templates with placeholders are simplified for the compare view: the numbers sit in the cells.
  return TOOLTIP_FOR[row.key].text.replace(/\{[^}]+\}/g, "…");
}

/**
 * Side-by-side comparison of 2–3 professors (SPEC 3.5): sticky first column, horizontal scroll on
 * small screens, best numeric value per row highlighted. Server-renderable (no hooks of its own).
 */
export function CompareTable({ details, school, className }: CompareTableProps) {
  const n = details.length;
  const { reviewsAvailable } = resolveSchoolFlags(school);
  const rows = numericRowsFor(reviewsAvailable);
  return (
    <div className={clsx("overflow-x-auto rounded-card border border-border bg-surface-raised shadow-card", className)}>
      <table className="w-full min-w-[40rem] border-collapse text-sm" aria-label="Professor comparison">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="sticky left-0 z-10 bg-surface-raised px-3 py-2 text-left text-[0.7rem] font-medium uppercase tracking-wide text-ink-faint">
              Stat
            </th>
            {details.map((d) => (
              <th key={d.professor.id} scope="col" className="px-3 py-2 text-left align-top">
                <Link href={buildProfessorHref(school.id, d.professor.slug)} className="text-base font-semibold text-link hover:underline">
                  {d.professor.displayName}
                </Link>
                <span className="block text-xs font-normal text-ink-muted">
                  {d.professor.department ?? d.professor.subjects.join(" / ")}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const values = details.map((d) => row.value(d));
            const best = new Set(bestIndexes(values, row.direction));
            return (
              <tr key={row.key} className="border-b border-border/60">
                <th scope="row" className="sticky left-0 z-10 bg-surface-raised px-3 py-2 text-left font-medium text-ink">
                  <StatTooltip label={`What does ${row.label} mean?`} content={tooltipText(row)}>
                    <span>{row.label}</span>
                  </StatTooltip>
                </th>
                {details.map((d, i) => (
                  <td
                    key={d.professor.id}
                    data-best={best.has(i) ? "true" : undefined}
                    className={clsx("px-3 py-2 tabular-nums text-ink", best.has(i) && clsx(BEST_CELL_CLASS, "font-semibold"))}
                  >
                    <span className="inline-flex items-center gap-2">
                      {formatCell(row, d)}
                      {row.key === "rating" && d.scores.ratingShrunk != null ? <ConfidenceDots confidence={d.scores.confidence} /> : null}
                    </span>
                    {row.key === "openSections" ? <OpenSectionChips detail={d} /> : null}
                  </td>
                ))}
              </tr>
            );
          })}

          <tr className="border-b border-border/60">
            <th scope="row" className="sticky left-0 z-10 bg-surface-raised px-3 py-2 text-left font-medium text-ink">
              Badges
            </th>
            {details.map((d) => (
              <td key={d.professor.id} className="px-3 py-2 align-top">
                {d.badges.length ? (
                  <BadgeRow badges={d.badges} seatStatusAvailable={school.seatStatusAvailable} reviewsAvailable={reviewsAvailable} gradeValueKind={school.gradeValueKind ?? "counts"} />
                ) : (
                  <span className="text-ink-faint">—</span>
                )}
              </td>
            ))}
          </tr>

          {reviewsAvailable ? (
          <tr className="border-b border-border/60">
            <th scope="row" className="sticky left-0 z-10 bg-surface-raised px-3 py-2 text-left font-medium text-ink">
              Vibe tags
            </th>
            {details.map((d) => (
              <td key={d.professor.id} className="px-3 py-2 align-top">
                {d.vibeTags.length ? <VibeTags tags={d.vibeTags} max={Infinity} /> : <span className="text-ink-faint">—</span>}
              </td>
            ))}
          </tr>
          ) : null}

          {reviewsAvailable ? (
          <tr>
            <th scope="row" className="sticky left-0 z-10 bg-surface-raised px-3 py-2 text-left align-top font-medium text-ink">
              AI verdict
            </th>
            {details.map((d) => (
              <td key={d.professor.id} className="px-3 py-2 align-top text-ink">
                {d.summary ? (
                  <>
                    <p className="m-0 leading-snug">{d.summary.verdict}</p>
                    <Chip size="sm" tone={d.summary.source !== "extractive" ? "brand" : "neutral"} className="mt-1">
                      {d.summary.source === "extractive" ? "Extractive" : `${d.summary.source === "claude" ? "Claude" : (d.summary.provider ?? "AI")} · ${d.summary.model ?? "model"}`}
                    </Chip>
                  </>
                ) : (
                  <span className="text-ink-muted">Not enough reviews to summarize</span>
                )}
              </td>
            ))}
          </tr>
          ) : null}
        </tbody>
      </table>
      {n < 2 ? <p className="m-0 px-3 py-2 text-xs text-ink-faint">Add another professor to compare.</p> : null}
    </div>
  );
}

/** First 3 open/offered sections as chips: "CS 225 AL1" + status. */
function OpenSectionChips({ detail }: { detail: ProfessorDetail }) {
  const open = sortSections(detail.sections).filter((s) => s.isOpen).slice(0, 3);
  const extra = openSectionCount(detail) - open.length;
  if (open.length === 0) return null;
  return (
    <ul aria-label="Open sections" className="mt-1 flex flex-wrap gap-1">
      {open.map((s) => (
        <li key={s.id} className="inline-flex items-center gap-1 text-xs">
          <Chip size="sm" tone="neutral" title={`CRN ${s.crn}`}>
            {courseLabelFromId(s.courseId)} {s.sectionCode}
          </Chip>
          <StatusChip status={s.status} />
        </li>
      ))}
      {extra > 0 ? <li className="text-xs text-ink-faint">+{extra}</li> : null}
    </ul>
  );
}

export default CompareTable;
