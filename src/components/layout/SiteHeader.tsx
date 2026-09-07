import Link from "next/link";
import type { ReactNode } from "react";
import type { SchoolChrome } from "./schoolChrome";
import { SchoolChromeBadge } from "./SchoolChromeSwitch";

/** Placeholder until the repository is published; README fills in the real URL. */
export const GITHUB_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "https://github.com/W3313/profpeek";

export interface SiteHeaderProps {
  /** Per-school chrome (design §8); the badge follows the school in the pathname. */
  chromeBySchool: Readonly<Record<string, SchoolChrome>>;
  defaultSchoolId: string;
  /** Optional replacement for the default badge switch (e.g. tests). */
  badge?: ReactNode;
}

/**
 * Sticky top bar shown on every page (SPEC 3.0): wordmark, About, GitHub, and
 * the per-school badge (`ModeBadge` on demo, `DataBadge` for real schools).
 */
export function SiteHeader({ chromeBySchool, defaultSchoolId, badge }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md text-lg font-semibold tracking-tight text-ink"
          aria-label="ProfPeek home"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-brand text-brand-ink"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4h12v9H6z" />
              <path d="M4 13h16v4H4z" />
              <path d="M7 17v3M17 17v3" />
            </svg>
          </span>
          <span>ProfPeek</span>
        </Link>

        <nav aria-label="Primary" className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link
            href="/about"
            className="rounded-md px-2.5 py-1.5 text-sm font-medium text-ink-muted hover:bg-surface-sunken hover:text-ink"
          >
            About
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-ink-muted hover:bg-surface-sunken hover:text-ink"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span>GitHub</span>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          {badge ?? <SchoolChromeBadge chromeBySchool={chromeBySchool} defaultSchoolId={defaultSchoolId} />}
        </nav>
      </div>
    </header>
  );
}

export default SiteHeader;
