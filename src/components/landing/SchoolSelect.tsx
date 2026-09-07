import type { ChangeEvent } from "react";
import clsx from "clsx";
import type { School } from "@/lib/domain/types";
import { pluralize } from "@/lib/utils/format";

/** One landing-page school option (design §8): registry identity plus counts from its meta.json. */
export interface SchoolOption extends Pick<School, "id" | "name" | "shortName"> {
  professorCount?: number;
  subjectCount?: number;
  /** false → the hint under the select says the school is grades-only. */
  reviewsAvailable?: boolean;
}

/** "UIUC — University of Illinois Urbana-Champaign · 108 professors · 6 subjects" (counts omitted when unknown). */
export function schoolOptionLabel(school: SchoolOption): string {
  const parts = [`${school.shortName} — ${school.name}`];
  if (school.professorCount != null) parts.push(pluralize(school.professorCount, "professor"));
  if (school.subjectCount != null) parts.push(pluralize(school.subjectCount, "subject"));
  return parts.join(" · ");
}

/** One-line hint for the chosen school: what kind of data sits behind it. */
export function schoolHint(school: SchoolOption | undefined): string | null {
  if (!school) return null;
  if (school.reviewsAvailable === false) return "Official grade data only — no student reviews yet, so professors are ranked by grade curve.";
  return null;
}

export interface SchoolSelectProps {
  schools: readonly SchoolOption[];
  value: string;
  onChange: (id: string) => void;
  id?: string;
  className?: string;
}

/**
 * Native `<select>` over every registered school with data (design §8). The label carries
 * "N professors · M subjects" so the choice is informed before any navigation.
 */
export function SchoolSelect({ schools, value, onChange, id = "hero-school", className }: SchoolSelectProps) {
  const current = schools.find((s) => s.id === value);
  const hint = schoolHint(current);
  const hintId = `${id}-hint`;
  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    const next = schools.find((s) => s.id === e.target.value);
    if (next) onChange(next.id);
  }
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        School
      </label>
      <select
        id={id}
        name="school"
        value={value}
        onChange={handleChange}
        aria-describedby={hint ? hintId : undefined}
        className={clsx(
          "h-11 w-full rounded-lg border border-border-strong bg-surface-raised px-3 text-base text-ink",
          "focus:border-brand disabled:opacity-50",
        )}
      >
        {schools.map((s) => (
          <option key={s.id} value={s.id}>
            {schoolOptionLabel(s)}
          </option>
        ))}
      </select>
      {hint ? (
        <p id={hintId} className="mt-1 text-xs text-ink-muted" data-testid="school-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export default SchoolSelect;
