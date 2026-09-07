import Link from "next/link";
import type { Subject } from "@/lib/domain/types";
import { pluralize } from "@/lib/utils/format";

export interface PopularSubjectChipsProps {
  schoolId: string;
  subjects: readonly Pick<Subject, "code" | "name" | "professorCount">[];
  /** How many to show (default 6). */
  limit?: number;
  className?: string;
}

/** Top N subjects by professorCount (ties by code) — the chips shown under the hero. */
export function pickPopularSubjects<T extends Pick<Subject, "code" | "professorCount">>(
  subjects: readonly T[],
  limit = 6,
): T[] {
  return [...subjects]
    .sort((a, b) => b.professorCount - a.professorCount || a.code.localeCompare(b.code))
    .slice(0, limit);
}

/** Quick links to the most-covered subjects of one school (SPEC 3.1 §2). No state; follows the hero's school. */
export function PopularSubjectChips({ schoolId, subjects, limit = 6, className }: PopularSubjectChipsProps) {
  const popular = pickPopularSubjects(subjects, limit);
  if (popular.length === 0) return null;
  return (
    <nav aria-label="Popular subjects" className={className}>
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 px-4 sm:px-6">
        <span className="mr-1 text-sm text-ink-muted">Popular:</span>
        {popular.map((s) => (
          <Link
            key={s.code}
            href={`/s/${encodeURIComponent(schoolId)}/${encodeURIComponent(s.code)}`}
            title={`${s.name} · ${pluralize(s.professorCount, "professor")}`}
            className="inline-flex h-8 items-center rounded-chip border border-border bg-surface-raised px-3 text-sm font-medium text-ink transition-colors hover:border-border-strong hover:bg-brand-soft"
          >
            {s.code}
            <span className="sr-only"> — {s.name}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

export default PopularSubjectChips;
