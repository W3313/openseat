"use client";

import clsx from "clsx";
import type { CourseRef } from "@/lib/domain/types";
import { Chip } from "@/components/ui/Chip";

export interface CourseChipsProps {
  courses: readonly CourseRef[];
  /** Selected course number (`?course=`), or undefined for "All". */
  value?: string;
  onChange: (number: string | undefined) => void;
  className?: string;
}

/** Courses sorted by number (numeric-aware, pure). */
export function sortCourseRefs(courses: readonly CourseRef[]): CourseRef[] {
  return [...courses].sort((a, b) => a.number.localeCompare(b.number, "en", { numeric: true }));
}

/**
 * Horizontally scrollable course filter (SPEC F12): "All" + one chip per
 * course showing the number, with the title on hover. `aria-pressed` marks
 * the active filter.
 */
export function CourseChips({ courses, value, onChange, className }: CourseChipsProps) {
  const sorted = sortCourseRefs(courses);
  return (
    <div role="group" aria-label="Filter by course" className={clsx("scrollbar-none flex items-center gap-1.5 overflow-x-auto py-0.5", className)}>
      <Chip size="md" tone={value === undefined ? "brand" : "neutral"} selected={value === undefined} onClick={() => onChange(undefined)}>
        All
      </Chip>
      {sorted.map((c) => {
        const selected = c.number === value;
        return (
          <Chip
            key={c.courseId}
            size="md"
            tone={selected ? "brand" : "neutral"}
            selected={selected}
            title={`${c.title} · ${c.professorCount} ${c.professorCount === 1 ? "professor" : "professors"}`}
            aria-label={`${c.number} — ${c.title}`}
            onClick={() => onChange(selected ? undefined : c.number)}
          >
            {c.number}
          </Chip>
        );
      })}
    </div>
  );
}

export default CourseChips;
