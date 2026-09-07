import Link from "next/link";
import clsx from "clsx";
import { ArrowLeft } from "lucide-react";
import type { ProfessorDetail, School } from "@/lib/domain/types";
import { buildRankingsHref } from "@/lib/utils/urlState";
import { TOOLTIPS } from "@/lib/copy/tooltips";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { resolveSchoolFlags, type SchoolLike } from "@/components/layout/schoolFlags";
import { ShareButton } from "@/components/rankings/ShareButton";
import { ShortlistButton } from "@/components/shortlist/ShortlistButton";
import { Chip } from "@/components/ui/Chip";
import { StatTooltip } from "@/components/ui/StatTooltip";
import { BadgeRow } from "./BadgeRow";
import { RatingBlock } from "./RatingBlock";
import { VibeTags } from "./VibeTags";

export interface ProfileHeaderProps {
  detail: Pick<ProfessorDetail, "professor" | "scores" | "badges" | "vibeTags" | "rankBySubject">;
  school: Pick<School, "id" | "shortName" | "seatStatusAvailable"> & SchoolLike;
  /** Subject code for "← Back to {CODE} rankings"; defaults to the professor's first subject. */
  backSubject?: string;
  className?: string;
}

/** "#3 in CS · #12 in ECE" (subjects where the professor is ranked). */
export function rankLine(rankBySubject: ProfessorDetail["rankBySubject"]): string | null {
  const parts = rankBySubject.filter((r) => r.rank != null).map((r) => `#${r.rank} in ${r.subject}`);
  return parts.length ? parts.join(" · ") : null;
}

/** Page title: "{displayName} — {subjects.join('/')} · ProfPeek" */
export function profileTitle(detail: Pick<ProfessorDetail, "professor">): string {
  return `${detail.professor.displayName} — ${detail.professor.subjects.join("/")} · ProfPeek`;
}

/** Detail-page header (SPEC 3.4 item 1). Grades-only schools (design §5) drop the rating block and vibe tags. */
export function ProfileHeader({ detail, school, backSubject, className }: ProfileHeaderProps) {
  const { professor, scores } = detail;
  const code = backSubject ?? professor.subjects[0];
  const ranks = rankLine(detail.rankBySubject);
  const { reviewsAvailable } = resolveSchoolFlags(school);

  return (
    <header className={clsx("flex flex-col gap-3", className)} data-variant={reviewsAvailable ? "reviews" : "grades-only"}>
      <Breadcrumb
        items={[
          { label: school.shortName, href: "/" },
          ...(code ? [{ label: code, href: buildRankingsHref(school.id, code) }] : []),
          { label: professor.displayName },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="m-0 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{professor.displayName}</h1>
          <p className="m-0 flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
            {professor.department ? <span>{professor.department}</span> : null}
            {reviewsAvailable && professor.kind === "grades-only" ? <span>Grade records only — no reviews linked</span> : null}
            {ranks ? <span className="tabular-nums">{ranks}</span> : null}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ShortlistButton professor={professor} variant="labeled" />
          <ShareButton />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {reviewsAvailable ? (
          <RatingBlock scores={scores} size="large" />
        ) : (
          <StatTooltip label="How is this professor ranked?" content={TOOLTIPS.stats.gradesOnly.text}>
            <Chip tone="brand" size="md">
              {TOOLTIPS.stats.gradesOnly.label}
            </Chip>
          </StatTooltip>
        )}
        <div className="flex flex-col gap-2">
          <BadgeRow badges={detail.badges} seatStatusAvailable={school.seatStatusAvailable} reviewsAvailable={reviewsAvailable} gradeValueKind={school.gradeValueKind ?? "counts"} size="md" />
          {reviewsAvailable ? <VibeTags tags={detail.vibeTags} max={Infinity} size="md" /> : null}
        </div>
      </div>

      {code ? (
        <p className="m-0 text-sm">
          <Link href={buildRankingsHref(school.id, code)} className="inline-flex items-center gap-1 font-medium text-link hover:underline">
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Back to {code} rankings
          </Link>
        </p>
      ) : null}
    </header>
  );
}

export default ProfileHeader;
