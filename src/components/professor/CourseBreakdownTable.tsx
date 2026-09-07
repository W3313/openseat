"use client";

import { useId, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import type { CourseBreakdown, GradeBucketKind, GradeValueKind } from "@/lib/domain/types";
import { TA_SCHED_TYPES } from "@/lib/domain/types";
import { buildCourseHref } from "@/lib/utils/urlState";
import { formatDelta, formatGpa, formatNumber, formatRate } from "@/lib/utils/format";
import { TOOLTIPS } from "@/lib/copy/tooltips";
import { Toggle } from "@/components/ui/Toggle";
import { StatTooltip } from "@/components/ui/StatTooltip";
import { GradeBar } from "@/components/charts/GradeBar";

/**
 * Design §4.1: sources that publish an avgGPA column carry it on the row as `sourceGpa`; the per-course
 * breakdown surfaces the (weighted) value for transparency. Optional until every builder emits it.
 */
export type CourseBreakdownRow = CourseBreakdown & { sourceGpa?: number | null };

export interface CourseBreakdownTableProps {
  courses: readonly CourseBreakdownRow[];
  schoolId: string;
  /** Show TA rows initially (tests / deep links). Default false. */
  defaultIncludeTa?: boolean;
  /** "percent" → the Students column is an estimate (each section scaled to 100). Default "counts". */
  gradeValueKind?: GradeValueKind;
  /** `School.gradeBuckets`, for the mini bars. */
  bucketKind?: GradeBucketKind;
  className?: string;
}

/** Headline rows first (by subject/number), then TA rows in the same order. */
export function sortBreakdowns<T extends CourseBreakdown>(courses: readonly T[]): T[] {
  return [...courses].sort((a, b) => {
    if (a.isHeadline !== b.isHeadline) return a.isHeadline ? -1 : 1;
    const s = a.subject.localeCompare(b.subject);
    if (s !== 0) return s;
    const n = a.number.localeCompare(b.number);
    if (n !== 0) return n;
    return b.graded - a.graded;
  });
}

export function visibleBreakdowns<T extends CourseBreakdown>(courses: readonly T[], includeTa: boolean): T[] {
  return sortBreakdowns(courses).filter((c) => includeTa || c.isHeadline);
}

/** True when at least one row carries a source-published GPA (the column is shown only then). */
export function hasSourceGpa(courses: readonly CourseBreakdownRow[]): boolean {
  return courses.some((c) => c.sourceGpa != null);
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
 * Per-course grade table (SPEC 3.4 item 4): Course, Title, Grade rows, Students, GPA, [Source GPA],
 * Baseline (others), Δ, W%, DFW%, mini GradeBar. The toggle reveals `TA_SCHED_TYPES` rows (default off).
 */
export function CourseBreakdownTable({
  courses,
  schoolId,
  defaultIncludeTa = false,
  gradeValueKind = "counts",
  bucketKind = "plus-minus",
  className,
}: CourseBreakdownTableProps) {
  const [includeTa, setIncludeTa] = useState(defaultIncludeTa);
  const headingId = useId();
  const taCount = courses.filter((c) => !c.isHeadline).length;
  const rows = visibleBreakdowns(courses, includeTa);
  const showSourceGpa = hasSourceGpa(courses);
  const percent = gradeValueKind === "percent";
  const columns = 10 + (showSourceGpa ? 1 : 0);

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
                <span className="inline-flex items-center gap-1">
                  {percent ? "Sections" : "Rows"} <StatTooltip label="What is a grade row?" content={percent ? TOOLTIPS.stats.sectionsGraded.text : TOOLTIPS.stats.gradeRows.text} />
                </span>
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                {percent ? (
                  <span className="inline-flex items-center gap-1">
                    Students (est.) <StatTooltip label="Why are these counts estimates?" content={TOOLTIPS.stats.countsAreEstimates.text} />
                  </span>
                ) : (
                  "Students"
                )}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">GPA</th>
              {showSourceGpa ? (
                <th scope="col" className="px-2 py-2 text-right font-medium">
                  <span className="inline-flex items-center gap-1">
                    {TOOLTIPS.stats.sourceGpa.label} <StatTooltip label="What is the source GPA?" content={TOOLTIPS.stats.sourceGpa.text} />
                  </span>
                </th>
              ) : null}
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
                <td colSpan={columns} className="px-3 py-3 text-ink-muted">
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
                    {showSourceGpa ? <td className="px-2 py-2 text-right tabular-nums text-ink-muted">{formatGpa(c.sourceGpa)}</td> : null}
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
                      <GradeBar buckets={c.buckets} height={10} subject={label} bucketKind={bucketKind} valueKind={gradeValueKind} focusable={false} className="w-40" />
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
