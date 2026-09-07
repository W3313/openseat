"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SchoolId } from "@/lib/domain/types";
import { buildRankingsHref } from "@/lib/utils/urlState";
import { Button } from "@/components/ui/Button";
import { SubjectNotFound, parseRankingsPath } from "@/components/rankings/SubjectNotFound";
import type { SubjectOption } from "@/components/landing/SubjectCombobox";

export interface NotFoundSwitchProps {
  subjectsBySchool: Readonly<Record<string, readonly SubjectOption[]>>;
  defaultSchoolId: SchoolId;
  /** Most-populated subjects of the default school, for the professor/course fallbacks. */
  topSubjects: readonly SubjectOption[];
}

/** "/s/uiuc/CS/999" → "999"; null when the path has no course segment. */
export function parseCourseNumber(pathname: string | null): string | null {
  const m = /^\/s\/[^/]+\/[^/]+\/([^/?#]+)/.exec(pathname ?? "");
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).toUpperCase();
  } catch {
    return m[1].toUpperCase();
  }
}

/**
 * Root 404 body (F13). Every valid rankings/course/professor path is enumerated at build time
 * (`dynamicParams = false`), so unknown ones land here with a real 404 status; the pathname says
 * which flavour of "not found" to show.
 */
export function NotFoundSwitch({ subjectsBySchool, defaultSchoolId, topSubjects }: NotFoundSwitchProps) {
  const pathname = usePathname();
  const { school, subject } = parseRankingsPath(pathname);
  const number = parseCourseNumber(pathname);
  // Own-property checks: a pathname segment like `constructor` must not reach Object.prototype.
  const schoolId = school && Object.hasOwn(subjectsBySchool, school) ? school : defaultSchoolId;
  const knownSubjects = Object.hasOwn(subjectsBySchool, schoolId) ? subjectsBySchool[schoolId] : [];
  const subjectKnown = subject != null && knownSubjects.some((s) => s.code === subject);

  if (subject && number && subjectKnown) {
    return (
      <Shell title={`No course ${subject} ${number} in the dataset`} note="The subject exists, but that course number has no grade rows or sections in the ingested data.">
        <Button href={buildRankingsHref(schoolId, subject)}>All {subject} professors</Button>
        <Button variant="secondary" href="/">Pick another subject</Button>
      </Shell>
    );
  }

  if (subject) {
    return <SubjectNotFound subjectsBySchool={subjectsBySchool} defaultSchoolId={defaultSchoolId} />;
  }

  if (/^\/p\//.test(pathname ?? "")) {
    return (
      <Shell title="No professor at this address" note="The link may be out of date, or the instructor has no grade rows, reviews or sections in the current dataset. Start from a subject list instead.">
        {topSubjects.map((s) => (
          <Link key={s.code} href={buildRankingsHref(defaultSchoolId, s.code)} className="rounded-chip border border-border px-2.5 py-1 text-sm text-link hover:underline">
            {s.code} · {s.name}
          </Link>
        ))}
      </Shell>
    );
  }

  return (
    <Shell title="Page not found" note="That link does not point at anything here. Start from the landing page to pick a school and subject, or read how the rankings are built.">
      <Button href="/">Find a professor</Button>
      <Button variant="secondary" href="/about">How ProfPeek works</Button>
    </Shell>
  );
}

function Shell({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start gap-4 px-4 py-16 sm:px-6">
      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-ink-faint">404</p>
      <h1 className="m-0 text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="m-0 text-sm text-ink-muted">{note}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </section>
  );
}
