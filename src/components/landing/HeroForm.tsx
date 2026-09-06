"use client";

import { useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { School, SchoolId } from "@/lib/domain/types";
import { SchoolSelect } from "./SchoolSelect";
import { SubjectCombobox, resolveSubjectText, type SubjectOption } from "./SubjectCombobox";
import { CourseNumberInput, isCompleteCourseNumber } from "./CourseNumberInput";

export const LAST_SCHOOL_KEY = "profpeek:v1:school";

export interface HeroFormProps {
  schools: readonly Pick<School, "id" | "name" | "shortName">[];
  subjects: readonly SubjectOption[];
  defaultSchoolId?: SchoolId;
}

/** `/s/uiuc/CS` or `/s/uiuc/CS?course=225`. */
export function rankingsHref(schoolId: SchoolId, subjectCode: string, course?: string): string {
  const base = `/s/${schoolId}/${encodeURIComponent(subjectCode)}`;
  return course && isCompleteCourseNumber(course) ? `${base}?course=${course}` : base;
}

function readLastSchool(): string | null {
  try {
    return window.localStorage.getItem(LAST_SCHOOL_KEY);
  } catch {
    return null;
  }
}

function writeLastSchool(id: SchoolId): void {
  try {
    window.localStorage.setItem(LAST_SCHOOL_KEY, id);
  } catch {
    /* private mode / quota — ignore */
  }
}

// The remembered school is external state (localStorage), so it is read through
// useSyncExternalStore: the server snapshot is null (no hydration mismatch) and
// the client snapshot is the stored id; cross-tab changes arrive via `storage`.
function subscribeStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
const getServerSnapshot = (): string | null => null;

/**
 * Landing hero (F1, SPEC 3.1): school select, subject typeahead, optional
 * course number, "Show rankings". Enter submits; the last chosen school is
 * remembered in localStorage.
 */
export function HeroForm({ schools, subjects, defaultSchoolId = "uiuc" }: HeroFormProps) {
  const router = useRouter();
  const savedSchool = useSyncExternalStore(subscribeStorage, readLastSchool, getServerSnapshot);
  const [schoolOverride, setSchoolOverride] = useState<SchoolId | null>(null);
  const schoolId: SchoolId =
    schoolOverride ??
    (savedSchool && schools.some((s) => s.id === savedSchool) ? (savedSchool as SchoolId) : defaultSchoolId);
  const [subject, setSubject] = useState<SubjectOption | null>(null);
  const [subjectText, setSubjectText] = useState("");
  const [course, setCourse] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const chosen = subject ?? resolveSubjectText(subjects, subjectText);
    if (!chosen) {
      setError(
        subjectText.trim() === ""
          ? "Pick a subject to see its rankings."
          : `No subject with data matches “${subjectText.trim()}”. Try a code like CS.`,
      );
      return;
    }
    setError(null);
    writeLastSchool(schoolId);
    router.push(rankingsHref(schoolId, chosen.code, course));
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit();
  }

  // Enter anywhere in the form submits unless a child (the combobox picking an
  // option) already consumed it. Handling it here keeps behaviour identical
  // across browsers and jsdom and avoids a double submit.
  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter" || e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON") return;
    e.preventDefault();
    submit();
  }

  return (
    <section aria-labelledby="hero-heading" className="mx-auto w-full max-w-3xl px-4 pt-12 pb-8 sm:px-6 sm:pt-20">
      <h1 id="hero-heading" className="text-3xl font-semibold tracking-tight text-ink sm:text-5xl">
        Find the professor, not just the course.
      </h1>
      <p className="mt-3 max-w-2xl text-base text-ink-muted sm:text-lg">
        Official grade curves + student reviews, filtered to sections you can still get into this term.
      </p>

      <form
        onSubmit={onSubmit}
        onKeyDown={onKeyDown}
        noValidate
        aria-describedby={error ? "hero-error" : undefined}
        className="mt-8 grid grid-cols-1 gap-4 rounded-xl border border-border bg-surface-raised p-4 shadow-sm sm:grid-cols-6 sm:p-5"
      >
        <SchoolSelect
          schools={schools}
          value={schoolId}
          onChange={(id) => {
            setSchoolOverride(id);
            writeLastSchool(id);
          }}
          className="sm:col-span-6"
        />
        <SubjectCombobox
          subjects={subjects}
          value={subject}
          onChange={(s) => {
            setSubject(s);
            if (s) setError(null);
          }}
          onInputChange={setSubjectText}
          className="sm:col-span-3"
        />
        <CourseNumberInput value={course} onChange={setCourse} className="sm:col-span-3" />
        <div className="sm:col-span-6 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="submit" size="lg" className="w-full sm:w-auto">
            Show rankings
          </Button>
          {error ? (
            <p id="hero-error" role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : (
            <p className="text-sm text-ink-faint">
              Only subjects with grade and schedule data are offered — no dead ends.
            </p>
          )}
        </div>
      </form>
    </section>
  );
}

export default HeroForm;
