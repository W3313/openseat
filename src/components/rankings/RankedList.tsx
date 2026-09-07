"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import type { RankingsPayload, RankingsQuery, RankingsResponse } from "@/lib/domain/types";
import { applyRankingsQuery, effectiveQuery } from "@/lib/scoring/rank";
import { parseRankingsQuery, withRankingsQuery } from "@/lib/utils/urlState";
import { resolveSchoolFlags } from "@/components/layout/schoolFlags";
import { SubjectStatStrip } from "./SubjectStatStrip";
import { ControlsBar } from "./ControlsBar";
import { ProfessorCard } from "./ProfessorCard";
import { LowDataGroup } from "./LowDataGroup";
import { EmptyState, emptyRankingsTitle } from "./EmptyState";

export interface RankedListProps {
  payload: RankingsPayload;
  /** `GRADE_YEARS_BACK`, for GPA tooltips. */
  yearsBack?: number;
  /** Course page: hide the course chips (SPEC 3.3). */
  showCourseChips?: boolean;
  className?: string;
}

/** professorId → displayName over the whole payload (for co-taught captions). */
export function professorNameMap(payload: Pick<RankingsPayload, "professors">): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of payload.professors) out[p.professor.id] = p.professor.displayName;
  return out;
}

// effectiveQuery lives in @/lib/scoring/rank (server-safe); re-exported here for existing importers.
export { effectiveQuery };

/**
 * Client island for the rankings page (SPEC 3.0 / 3.2 items 2–6). Reads
 * sort/open/course from the URL with `useSearchParams` (the parent wraps it in
 * `<Suspense>`), applies the pure `applyRankingsQuery` over the precomputed
 * payload, and writes changes back with `router.replace` so views are
 * shareable (F17). Unrelated keys such as `picks` are preserved.
 */
export function RankedList({ payload, yearsBack, showCourseChips = true, className }: RankedListProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const { school, subject } = payload;
  const flags = useMemo(() => resolveSchoolFlags(school, { mode: payload.mode }), [school, payload.mode]);
  const { reviewsAvailable } = flags;

  const searchString = searchParams.toString();
  const query = useMemo(() => effectiveQuery(parseRankingsQuery(searchString), reviewsAvailable), [searchString, reviewsAvailable]);
  const response: RankingsResponse = useMemo(() => applyRankingsQuery(payload, query), [payload, query]);
  const names = useMemo(() => professorNameMap(payload), [payload]);

  const setQuery = useCallback(
    (next: RankingsQuery) => {
      const params = withRankingsQuery(searchString, next);
      const s = params.toString();
      router.replace(`${pathname}${s ? `?${s}` : ""}`, { scroll: false });
    },
    [router, pathname, searchString],
  );

  const seatStatusAvailable = school.seatStatusAvailable;

  return (
    <div className={clsx("flex flex-col gap-4", className)} data-variant={reviewsAvailable ? "reviews" : "grades-only"}>
      <SubjectStatStrip
        subjectGpaMean={payload.subjectGpaMean}
        totals={response.totals}
        seatStatusAvailable={seatStatusAvailable}
        reviewsAvailable={reviewsAvailable}
      />

      <ControlsBar
        query={query}
        onChange={setQuery}
        courses={payload.courses}
        seatStatusAvailable={seatStatusAvailable}
        reviewsAvailable={reviewsAvailable}
        showCourseChips={showCourseChips}
      />

      {response.ranked.length === 0 ? (
        <EmptyState
          title={
            query.openOnly
              ? emptyRankingsTitle(subject.code, seatStatusAvailable)
              : query.course
                ? `No ranked professors for ${subject.code} ${query.course}`
                : reviewsAvailable
                  ? `No ranked professors in ${subject.code} yet`
                  : `No professors with grade data in ${subject.code} yet`
          }
          description={
            query.openOnly
              ? `Professors without an ${seatStatusAvailable ? "open" : "offered"} section this term are hidden. Turning the filter off shows everyone with ${reviewsAvailable ? "grade data or reviews" : "grade data"}.`
              : response.lowData.length > 0
                ? reviewsAvailable
                  ? "Everyone here has fewer than 3 reviews — see the group below."
                  : "Everyone here is missing grade rows in the window — see the group below."
                : undefined
          }
          actionLabel={query.openOnly ? (seatStatusAvailable ? "Include closed sections" : "Include all sections") : undefined}
          onAction={query.openOnly ? () => setQuery({ ...query, openOnly: false }) : undefined}
          secondaryHref={query.course ? pathname : undefined}
          secondaryLabel={query.course ? "Clear course filter" : undefined}
        />
      ) : (
        <ol aria-label={`${subject.code} professors ranked`} className="m-0 flex list-none flex-col gap-3 p-0">
          {response.ranked.map((item) => (
            <li key={item.professor.id}>
              <ProfessorCard
                item={item}
                schoolId={school.id}
                subject={subject.code}
                timezone={school.timezone}
                seatStatusAvailable={seatStatusAvailable}
                reviewsAvailable={reviewsAvailable}
                gradeValueKind={flags.gradeValueKind}
                bucketKind={flags.gradeBuckets}
                sparklineRange={payload.sparklineRange}
                professorNames={names}
                onCourseSelect={(number) => setQuery({ sort: query.sort, openOnly: query.openOnly, course: number })}
                selectedCourse={query.course}
                yearsBack={yearsBack}
              />
            </li>
          ))}
        </ol>
      )}

      <LowDataGroup items={response.lowData} schoolId={school.id} seatStatusAvailable={seatStatusAvailable} reviewsAvailable={reviewsAvailable} />

      {/* SLOT: <ShortlistDrawer schoolId={school.id} /> — F16 FAB, added by the shortlist agent (src/components/shortlist/ShortlistDrawer.tsx) */}
    </div>
  );
}

export default RankedList;
