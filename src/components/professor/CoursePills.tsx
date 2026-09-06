import clsx from "clsx";
import type { CourseBreakdown } from "@/lib/domain/types";
import { Chip } from "@/components/ui/Chip";
import { buildRankingsHref } from "@/lib/utils/urlState";

export interface CoursePillsProps {
  courses: readonly Pick<CourseBreakdown, "courseId" | "number" | "title" | "isHeadline">[];
  schoolId: string;
  subject: string;
  /** When given, pills are buttons calling back with the course number (client filter). Otherwise links to `?course=`. */
  onSelect?: (number: string) => void;
  selected?: string;
  /** Cap on pills; the remainder collapses to "+N". Default 6. */
  max?: number;
  className?: string;
}

/** Distinct headline course numbers, ascending, with titles (pure). */
export function distinctCourses(courses: CoursePillsProps["courses"]): { number: string; title: string }[] {
  const seen = new Map<string, string>();
  for (const c of courses) {
    if (!c.isHeadline) continue;
    if (!seen.has(c.number)) seen.set(c.number, c.title);
  }
  if (seen.size === 0) {
    for (const c of courses) if (!seen.has(c.number)) seen.set(c.number, c.title);
  }
  return [...seen.entries()].map(([number, title]) => ({ number, title })).sort((a, b) => a.number.localeCompare(b.number));
}

/**
 * Course numbers this professor teaches (SPEC 3.2 item 5). Click → `course=`
 * filter on the rankings page.
 */
export function CoursePills({ courses, schoolId, subject, onSelect, selected, max = 6, className }: CoursePillsProps) {
  const list = distinctCourses(courses);
  if (list.length === 0) return null;
  const shown = list.slice(0, max);
  const rest = list.length - shown.length;
  return (
    <ul aria-label="Courses taught" className={clsx("flex flex-wrap items-center gap-1", className)}>
      {shown.map(({ number, title }) => {
        const label = `${subject} ${number}`;
        const isSelected = selected === number;
        return (
          <li key={number} className="inline-flex">
            {onSelect ? (
              <Chip
                size="sm"
                tone={isSelected ? "brand" : "neutral"}
                title={title}
                selected={isSelected}
                onClick={() => onSelect(number)}
                aria-label={`Filter to ${label} — ${title}`}
              >
                {number}
              </Chip>
            ) : (
              <Chip size="sm" tone={isSelected ? "brand" : "neutral"} title={title} href={buildRankingsHref(schoolId, subject, { course: number })}>
                {number}
              </Chip>
            )}
          </li>
        );
      })}
      {rest > 0 ? (
        <li className="text-[0.7rem] text-ink-faint" title={list.slice(max).map((c) => `${subject} ${c.number}`).join(", ")}>
          +{rest}
        </li>
      ) : null}
    </ul>
  );
}

export default CoursePills;
