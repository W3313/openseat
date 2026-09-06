"use client";

import clsx from "clsx";
import type { CourseRef, RankingsQuery, SortKey } from "@/lib/domain/types";
import { SortSegmented } from "./SortSegmented";
import { OpenOnlyToggle } from "./OpenOnlyToggle";
import { CourseChips } from "./CourseChips";

export interface ControlsBarProps {
  query: RankingsQuery;
  onChange: (next: RankingsQuery) => void;
  courses: readonly CourseRef[];
  seatStatusAvailable: boolean;
  /** Course page reuses the bar without chips (SPEC 3.3). */
  showCourseChips?: boolean;
  className?: string;
}

/**
 * Sticky control strip under the site header (SPEC 3.2 item 3): sort, open
 * toggle, course chips. Pure w.r.t. URL state — the parent owns the query.
 */
export function ControlsBar({ query, onChange, courses, seatStatusAvailable, showCourseChips = true, className }: ControlsBarProps) {
  function setSort(sort: SortKey) {
    onChange({ ...query, sort });
  }
  function setOpenOnly(openOnly: boolean) {
    onChange({ ...query, openOnly });
  }
  function setCourse(course: string | undefined) {
    const next: RankingsQuery = { sort: query.sort, openOnly: query.openOnly };
    if (course) next.course = course;
    onChange(next);
  }

  return (
    <div
      className={clsx(
        "sticky top-14 z-30 -mx-4 flex flex-col gap-2 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-surface/80 sm:-mx-6 sm:px-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <SortSegmented value={query.sort} onChange={setSort} />
        <OpenOnlyToggle checked={query.openOnly} onChange={setOpenOnly} seatStatusAvailable={seatStatusAvailable} />
      </div>
      {showCourseChips && courses.length > 0 ? <CourseChips courses={courses} value={query.course} onChange={setCourse} /> : null}
    </div>
  );
}

export default ControlsBar;
