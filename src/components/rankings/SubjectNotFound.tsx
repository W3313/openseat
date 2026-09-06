"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { SchoolId } from "@/lib/domain/types";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import { SubjectCombobox, type SubjectOption } from "@/components/landing/SubjectCombobox";
import { buildRankingsHref } from "@/lib/utils/urlState";
import { didYouMeanSubjects } from "./didYouMean";

export interface SubjectNotFoundProps {
  /** Subjects with data, per school id. */
  subjectsBySchool: Readonly<Record<string, readonly SubjectOption[]>>;
  defaultSchoolId: SchoolId;
}

/** "/s/uiuc/CSX?x=1" → { school: "uiuc", subject: "CSX" } */
export function parseRankingsPath(pathname: string | null): { school: string | null; subject: string | null } {
  const m = /^\/s\/([^/]+)\/([^/?#]+)/.exec(pathname ?? "");
  if (!m) return { school: null, subject: null };
  try {
    return { school: decodeURIComponent(m[1]).toLowerCase(), subject: decodeURIComponent(m[2]).toUpperCase() };
  } catch {
    return { school: m[1].toLowerCase(), subject: m[2].toUpperCase() };
  }
}

/**
 * Body of `/s/[school]/[subject]/not-found.tsx` (SPEC 3.0). `not-found.tsx`
 * receives no params, so the subject code is read from the pathname on the
 * client and the suggestions are computed here.
 */
export function SubjectNotFound({ subjectsBySchool, defaultSchoolId }: SubjectNotFoundProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { school: schoolFromPath, subject } = parseRankingsPath(pathname);
  const schoolId = schoolFromPath && subjectsBySchool[schoolFromPath] ? schoolFromPath : defaultSchoolId;
  const subjects = useMemo(() => subjectsBySchool[schoolId] ?? [], [subjectsBySchool, schoolId]);
  const suggestions = useMemo(() => didYouMeanSubjects(subject ?? "", subjects), [subject, subjects]);
  const [picked, setPicked] = useState<SubjectOption | null>(null);

  function go(code: string) {
    router.push(buildRankingsHref(schoolId, code));
  }

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 px-4 py-16 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">404</p>
      <h1 className="m-0 text-2xl font-semibold tracking-tight text-ink">
        No data for <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[0.9em]">{subject ?? "this subject"}</code>
      </h1>
      <p className="m-0 text-sm text-ink-muted">
        {schoolFromPath && !subjectsBySchool[schoolFromPath]
          ? `We do not have a school called "${schoolFromPath}" yet.`
          : "That subject code is not in the ingested dataset. Only subjects with grade rows and sections are listed."}
      </p>
      {suggestions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-sm font-medium text-ink">Did you mean</p>
          <ul aria-label="Suggested subjects" className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {suggestions.map((s) => (
              <li key={s.code}>
                <Chip tone="brand" href={buildRankingsHref(schoolId, s.code)} title={s.name}>
                  {s.code} · {s.name}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <form
        className="flex w-full flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (picked) go(picked.code);
        }}
      >
        <div className="flex-1">
          <SubjectCombobox
            id="notfound-subject"
            subjects={subjects}
            value={picked}
            onChange={(v) => {
              setPicked(v);
              if (v) go(v.code);
            }}
          />
        </div>
        <Button type="submit" disabled={!picked}>
          Show rankings
        </Button>
      </form>
      <Button variant="ghost" size="sm" href="/">
        ← Back to the landing page
      </Button>
    </section>
  );
}

export default SubjectNotFound;
