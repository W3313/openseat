import type { ChangeEvent } from "react";
import clsx from "clsx";
import type { School, SchoolId } from "@/lib/domain/types";

export interface SchoolSelectProps {
  schools: readonly Pick<School, "id" | "name" | "shortName">[];
  value: SchoolId;
  onChange: (id: SchoolId) => void;
  id?: string;
  className?: string;
}

/** "UIUC — University of Illinois Urbana-Champaign" */
export function schoolOptionLabel(school: Pick<School, "name" | "shortName">): string {
  return `${school.shortName} — ${school.name}`;
}

/**
 * Native `<select>` for the school (SPEC 3.1). One option in this build; it
 * exists so the multi-school architecture is visible and keyboard-friendly.
 */
export function SchoolSelect({ schools, value, onChange, id = "hero-school", className }: SchoolSelectProps) {
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
    </div>
  );
}

export default SchoolSelect;
