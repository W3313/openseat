"use client";

import { useId, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import type { CourseBreakdown } from "@/lib/domain/types";
import { TA_SCHED_TYPES } from "@/lib/domain/types";
import { buildCourseHref } from "@/lib/utils/urlState";
import { formatDelta, formatGpa, formatNumber, formatRate } from "@/lib/utils/format";
import { TOOLTIPS } from "@/lib/copy/tooltips";
import { Toggle } from "@/components/ui/Toggle";
import { StatTooltip } from "@/components/ui/StatTooltip";
import { GradeBar } from "@/components/charts/GradeBar";

export interface CourseBreakdownTableProps {
  courses: readonly CourseBreakdown[];
  schoolId: string;
  /** Show TA rows initially (tests / deep links). Default false. */
  defaultIncludeTa?: boolean;
  className?: string;
}

/** Headline rows first (by subject/number), then TA rows in the same order. */
export function sortBreakdowns(courses: readonly CourseBreakdown[]): CourseBreakdown[] {
  return [...courses].sort((a, b) => {
    if (a.isHeadline !== b.isHeadline) return a.isHeadline ? -1 : 1;
    const s = a.subject.localeCompare(b.subject);
    if (s !== 0) return s;
    const n = a.number.localeCompare(b.number);
    if (n !== 0) return n;
    return b.graded - a.graded;
  });
}

export function visibleBreakdowns(courses: readonly CourseBreakdown[], includeTa: boolean): CourseBreakdown[] {
  return sortBreakdowns(courses).filter((c) => includeTa || c.isHeadline);
}

const TA_LABEL = `Include discussion/lab rows`;
const TA_DESCRIPTION = `Rows whose primary instructor is usually a TA (${[...TA_SCHED_TYPES].join(", ")}); they never feed the headline stats.`;

function deltaClass(delta: number | null): string {
  if (delta == null) return "text-ink-muted";
  if (delta >= 0.05) return "text-success";
  if (delta <= -0.05) return "text-danger";
  return "text-ink";
}

/**
 * Per-course grade table (SPEC 3.4 item 4): Course, Title, Grade rows, Students, GPA, Baseline
 * (others), Δ, W%, DFW%, mini GradeBar. The toggle reveals `TA_SCHED_TYPES` rows (default off).
 */
export function CourseBreakdownTable({ courses, schoolId, defaultIncludeTa = false, className }: CourseBreakdownTableProps) {
  const [includeTa, setIncludeTa] = useState(defaultIncludeTa);
  const headingId = useId();
  const taCount = courses.filter((c) => !c.isHeadline).length;
  const rows = visibleBreakdowns(courses, includeTa);

  return (
    <section id="courses" aria-labelledby={headingId} className={clsx("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="m-0 text-base font-semibold text-ink">
          Grades by course
        </h2>
        {taCount > 0 ? (
          <Toggle label={TA_LABEL} description={undefined} checked={includeTa} onChange={setIncludeTa} hint={<StatTooltip label="Which rows are these?" content={TA_DESCRIPTION} />} />
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-card border border-border bg-surface-raised">
        <table className="w-full min-w-[46rem] border-collapse text-sm" aria-label="Grades by course">
          <thead>
            <tr className="border-b border-border text-[0.7rem] uppercase tracking-wide text-ink-faint">
              <th scope="col" className="px-3 py-2 text-left font-medium">Course</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Title</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                <span className="inline-flex items-center gap-1">Rows <StatTooltip label="What is a grade row?" content={TOOLTIPS.stats.gradeRows.text} /></span>
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Students</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">GPA</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                <span className="inline-flex items-center gap-1">Baseline <StatTooltip label="What is the baseline?" content="Average GPA of the same course taught by others in the same window (leave-one-out)." /></span>
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Δ</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">W%</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">DFW%</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Distribution</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-3 text-ink-muted">
                  No grade rows in the window.
                </td>
              </tr>
            ) : (
              rows.map((c) => {
                const label = `${c.subject} ${c.number}`;
                return (
                  <tr key={`${c.courseId}:${c.isHeadline ? "h" : "ta"}`} className={clsx("border-b border-border/60 last:border-0", !c.isHeadline && "bg-surface-sunken/50")}>
                    <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium text-ink">
                      <Link href={buildCourseHref(schoolId, c.subject, c.number)} className="text-link hover:underline">
                        {label}
                      </Link>
                      {!c.isHeadline ? <span className="ml-1 rounded bg-surface-sunken px-1 text-[0.65rem] font-normal uppercase tracking-wide text-ink-muted">TA rows</span> : null}
                    </th>
                    <td className="max-w-[14rem] truncate px-3 py-2 text-ink-muted" title={c.title}>
                      {c.title}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink">{formatNumber(c.gradeRows)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink">{formatNumber(c.graded)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink">{formatGpa(c.gpa)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink-muted">
                      {formatGpa(c.baselineGpa)}
                      {c.baselineN > 0 ? <span className="block text-[0.65rem] text-ink-faint">n={formatNumber(c.baselineN)}</span> : null}
                    </td>
                    <td className={clsx("px-2 py-2 text-right font-medium tabular-nums", deltaClass(c.delta))}>
                      {c.delta == null ? "—" : formatDelta(c.delta)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink">{formatRate(c.wRate)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink">{formatRate(c.dfwRate)}</td>
                    <td className="px-3 py-2">
                      <GradeBar buckets={c.buckets} height={10} subject={label} focusable={false} className="w-40" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default CourseBreakdownTable;
