import clsx from "clsx";
import type { RankingsPayload, School, Subject, TermCode } from "@/lib/domain/types";
import { termDisplay } from "@/lib/utils/term";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { TermPill } from "./TermPill";
import { GradesThroughPill } from "./GradesThroughPill";
import { ShareButton } from "./ShareButton";

export interface RankingsHeaderProps {
  school: Pick<School, "id" | "shortName" | "timezone" | "seatStatusAvailable" | "currentTerm">;
  subject: Pick<Subject, "code" | "name">;
  term: TermCode;
  seatsFetchedAt: string;
  gradesThroughTerm: TermCode;
  termFallback: boolean;
  scheduleTerm?: TermCode;
  yearsBack?: number;
  /** Course page: "CS 225 — Data Structures" replaces the subject heading. */
  heading?: string;
  className?: string;
}

/** Page title: "{SUBJECT} professors with open sections — Fall 2026 · ProfPeek" (+ " · DEMO"). */
export function rankingsTitle(payload: Pick<RankingsPayload, "subject" | "term" | "mode" | "school">): string {
  const what = payload.school.seatStatusAvailable ? "open sections" : "offered sections";
  const base = `${payload.subject.code} professors with ${what} — ${termDisplay(payload.term)} · ProfPeek`;
  return payload.mode === "demo" ? `${base} · DEMO` : base;
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
  seatsFetchedAt,
  gradesThroughTerm,
  termFallback,
  scheduleTerm,
  yearsBack,
  heading,
  className,
}: RankingsHeaderProps) {
  return (
    <header className={clsx("flex flex-col gap-3", className)}>
      <Breadcrumb items={[{ label: school.shortName, href: "/" }, { label: subject.code }]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="m-0 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{heading ?? rankingsHeading(subject)}</h1>
        <ShareButton className="shrink-0" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
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
