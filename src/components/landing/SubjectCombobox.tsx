"use client";

import { Combobox } from "@/components/ui/Combobox";
import { pluralize } from "@/lib/utils/format";
import type { Subject } from "@/lib/domain/types";

export type SubjectOption = Pick<Subject, "code" | "name" | "professorCount">;

export interface SubjectComboboxProps {
  subjects: readonly SubjectOption[];
  value: SubjectOption | null;
  onChange: (value: SubjectOption | null) => void;
  /** Raw typed text on every keystroke (lets the form resolve "cs" on submit). */
  onInputChange?: (text: string) => void;
  id?: string;
  autoFocus?: boolean;
  className?: string;
}

/** "CS · Computer Science · 15 professors" — the option row and its search text. */
export function subjectOptionText(s: SubjectOption): string {
  return `${s.code} · ${s.name} · ${pluralize(s.professorCount, "professor")}`;
}

/**
 * Resolve free text to a subject: exact code (case-insensitive) first, then a
 * unique code-prefix match, then a unique name match. Null when ambiguous.
 */
export function resolveSubjectText(subjects: readonly SubjectOption[], text: string): SubjectOption | null {
  const q = text.trim().toLowerCase();
  if (q === "") return null;
  const exact = subjects.find((s) => s.code.toLowerCase() === q);
  if (exact) return exact;
  const byPrefix = subjects.filter((s) => s.code.toLowerCase().startsWith(q));
  if (byPrefix.length === 1) return byPrefix[0];
  const byName = subjects.filter((s) => s.name.toLowerCase().includes(q));
  if (byName.length === 1) return byName[0];
  return null;
}

/**
 * Typeahead over the ingested subjects (F1). Only subjects with data are
 * offered, so there are no dead ends. Wraps the shared `Combobox` primitive
 * (`role="combobox"`, `aria-activedescendant`, arrow/Enter/Escape keys).
 */
export function SubjectCombobox({
  subjects,
  value,
  onChange,
  onInputChange,
  id = "hero-subject",
  autoFocus,
  className,
}: SubjectComboboxProps) {
  return (
    <Combobox<SubjectOption>
      id={id}
      name="subject"
      label="Subject"
      options={subjects}
      value={value}
      onChange={onChange}
      onInputChange={onInputChange}
      getKey={(s) => s.code}
      getLabel={(s) => s.code}
      getSearchText={(s) => s.name}
      renderOption={(s) => (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="w-14 shrink-0 font-semibold tabular-nums">{s.code}</span>
          <span className="truncate">{s.name}</span>
          <span className="ml-auto shrink-0 text-xs text-ink-muted">
            {pluralize(s.professorCount, "professor")}
          </span>
        </span>
      )}
      placeholder="Subject, e.g. CS"
      emptyMessage="No subject with data matches that"
      autoFocus={autoFocus}
      required
      className={className}
    />
  );
}

export default SubjectCombobox;
