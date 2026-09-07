import clsx from "clsx";
import type { DataMode, RankingsPayload, School, Subject, TermCode } from "@/lib/domain/types";
import { termDisplay } from "@/lib/utils/term";
import { TOOLTIPS } from "@/lib/copy/tooltips";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { resolveSchoolFlags, type SchoolLike } from "@/components/layout/schoolFlags";
import { Chip } from "@/components/ui/Chip";
import { StatTooltip } from "@/components/ui/StatTooltip";
import { TermPill } from "./TermPill";
import { GradesThroughPill } from "./GradesThroughPill";
import { ShareButton } from "./ShareButton";

export interface RankingsHeaderProps {
  school: Pick<School, "id" | "shortName" | "timezone" | "seatStatusAvailable" | "currentTerm"> & SchoolLike;
  subject: Pick<Subject, "code" | "name">;
  term: TermCode;
  /** `RankingsPayload.mode`; resolves the school flags when school.json predates them. */
  mode?: DataMode;
  seatsFetchedAt: string;
  gradesThroughTerm: TermCode;
  termFallback: boolean;
  scheduleTerm?: TermCode;
  yearsBack?: number;
  /** Course page: "CS 225 — Data Structures" replaces the subject heading. */
  heading?: string;
  className?: string;
}

/**
 * Page title (SPEC 3.2 / design §5):
 *   reviews: "{SUBJECT} professors with open sections — Fall 2026 · ProfPeek"
 *   grades-only: "{SUBJECT} professors ranked by grade curve — Fall 2026 · ProfPeek"
 */
export function rankingsTitle(payload: Pick<RankingsPayload, "subject" | "term" | "mode" | "school">): string {
  const flags = resolveSchoolFlags(payload.school, { mode: payload.mode });
  const what = flags.reviewsAvailable
    ? `with ${payload.school.seatStatusAvailable ? "open sections" : "offered sections"}`
    : "ranked by grade curve";
  return `${payload.subject.code} professors ${what} — ${termDisplay(payload.term)} · ProfPeek`;
}

/** Meta description for the rankings page, by mode. */
export function rankingsDescription(payload: Pick<RankingsPayload, "subject" | "mode" | "school">): string {
  const flags = resolveSchoolFlags(payload.school, { mode: payload.mode });
  const text = flags.reviewsAvailable
    ? `${payload.subject.name} professors at ${payload.school.shortName} ranked by student rating, with official grade curves and sections you can still get into this term.`
    : `${payload.subject.name} professors at ${payload.school.shortName} ranked by grade curve — official per-instructor grade distributions compared with the same courses taught by others, plus this term's sections.`;
  return text.slice(0, 155);
}

/** "Computer Science (CS)" */
export function rankingsHeading(subject: Pick<Subject, "code" | "name">): string {
  return `${subject.name} (${subject.code})`;
}

/** Breadcrumb, H1, TermPill, GradesThroughPill and ShareButton (SPEC 3.2 item 1). */
export function RankingsHeader({
  school,
  subject,
  term,
  mode,
  seatsFetchedAt,
  gradesThroughTerm,
  termFallback,
  scheduleTerm,
  yearsBack,
  heading,
  className,
}: RankingsHeaderProps) {
  const flags = resolveSchoolFlags(school, mode ? { mode } : {});
  return (
    <header className={clsx("flex flex-col gap-3", className)}>
      <Breadcrumb items={[{ label: school.shortName, href: "/" }, { label: subject.code }]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="m-0 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{heading ?? rankingsHeading(subject)}</h1>
        <ShareButton className="shrink-0" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!flags.reviewsAvailable ? (
          <StatTooltip label="How are these professors ranked?" content={TOOLTIPS.stats.gradesOnly.text}>
            <Chip tone="brand" size="md">
              {TOOLTIPS.stats.gradesOnly.label}
            </Chip>
          </StatTooltip>
        ) : null}
        <TermPill
          term={term}
          seatsFetchedAt={seatsFetchedAt}
          timezone={school.timezone}
          seatStatusAvailable={school.seatStatusAvailable}
          termFallback={termFallback}
          scheduleTerm={scheduleTerm}
        />
        <GradesThroughPill gradesThroughTerm={gradesThroughTerm} currentTerm={school.currentTerm} yearsBack={yearsBack} />
      </div>
    </header>
  );
}

export default RankingsHeader;
