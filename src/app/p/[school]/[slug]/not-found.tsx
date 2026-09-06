import type { Metadata } from "next";
import Link from "next/link";
import { getRepository } from "@/lib/repo";
import { DEFAULT_SCHOOL_ID } from "@/lib/config/schools";
import { buildRankingsHref } from "@/lib/utils/urlState";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Professor not found · ProfPeek",
  robots: { index: false },
};

/**
 * Unknown professor slug (SPEC 3.0): a short message linking back to the subject lists.
 * `not-found.tsx` receives no params, so the subject links come from the default school.
 */
export default async function ProfessorNotFound() {
  const repo = getRepository();
  const subjects = await repo.getSubjects(DEFAULT_SCHOOL_ID).catch(() => []);
  const top = [...subjects].sort((a, b) => b.professorCount - a.professorCount).slice(0, 6);

  return (
    <section className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start gap-4 px-4 py-16 sm:px-6">
      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-ink-faint">404</p>
      <h1 className="m-0 text-2xl font-semibold tracking-tight text-ink">No professor at this address</h1>
      <p className="m-0 text-sm text-ink-muted">
        The link may be out of date, or the instructor has no grade rows, reviews or sections in the current dataset. Start from a
        subject list instead.
      </p>
      {top.length ? (
        <ul aria-label="Subjects with data" className="m-0 flex flex-wrap gap-2 p-0">
          {top.map((s) => (
            <li key={s.code} className="list-none">
              <Link
                href={buildRankingsHref(DEFAULT_SCHOOL_ID, s.code)}
                className="inline-flex h-8 items-center rounded-chip border border-border bg-surface-raised px-3 text-sm font-medium text-ink hover:bg-surface-sunken"
              >
                {s.code}
                <span className="ml-1 text-xs font-normal text-ink-faint">{s.professorCount}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <Button href="/" variant="secondary">
        Back to the start
      </Button>
    </section>
  );
}
