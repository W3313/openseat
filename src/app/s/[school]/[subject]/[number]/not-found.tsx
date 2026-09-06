"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/Button";

// Client component (needs the pathname), so it cannot export `metadata`; the page's own
// generateMetadata returns "Course not found · ProfPeek" + noindex for unknown numbers.

/** `/s/uiuc/CS/999` → { school: "uiuc", subject: "CS", number: "999" } (null when the path is not course-shaped). */
export function parseCoursePath(pathname: string | null | undefined): { school: string; subject: string; number: string } | null {
  const m = /^\/s\/([^/]+)\/([^/]+)\/([^/?#]+)/.exec(pathname ?? "");
  if (!m) return null;
  return { school: decodeURIComponent(m[1]).toLowerCase(), subject: decodeURIComponent(m[2]).toUpperCase(), number: decodeURIComponent(m[3]).toUpperCase() };
}

/** Unknown course number under a known subject (SPEC 3.3): link back to the subject rankings. */
export default function CourseNotFound() {
  const parsed = parseCoursePath(usePathname());
  const subjectHref = parsed ? `/s/${encodeURIComponent(parsed.school)}/${encodeURIComponent(parsed.subject)}` : "/";
  return (
    <section className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start gap-4 px-4 py-16 sm:px-6">
      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-ink-faint">404</p>
      <h1 className="m-0 text-2xl font-semibold tracking-tight text-ink">
        No data for {parsed ? `${parsed.subject} ${parsed.number}` : "this course"}
      </h1>
      <p className="m-0 text-sm text-ink-muted">
        No grade rows or sections for that course number are in the current dataset. It may be a new course, or one that has not been
        offered in the grade window.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button href={subjectHref}>{parsed ? `All ${parsed.subject} professors` : "Back to the start"}</Button>
        <Link href="/" className="inline-flex h-10 items-center text-sm font-medium text-link hover:underline">
          Start over
        </Link>
      </div>
    </section>
  );
}
