import type { ReactNode } from 'react';
import clsx from 'clsx';

/** Anchor ids of /about (SPEC 3.6), in page order. Also drives the table of contents. */
export const ABOUT_SECTIONS = [
  { id: 'what', title: 'What this is' },
  { id: 'sources', title: 'Data sources' },
  { id: 'reviews', title: 'Why there are no reviews' },
  { id: 'scoring', title: 'How the numbers work' },
  { id: 'badges', title: 'Badges' },
  { id: 'matching', title: 'Name matching' },
  { id: 'ai', title: 'AI summaries' },
  { id: 'glossary', title: 'Glossary' },
  { id: 'limitations', title: 'Limitations' },
  { id: 'privacy', title: 'Privacy' },
  { id: 'licensing', title: 'Licensing' },
] as const;

export type AboutSectionId = (typeof ABOUT_SECTIONS)[number]['id'];

export function aboutSectionTitle(id: AboutSectionId): string {
  return ABOUT_SECTIONS.find((s) => s.id === id)?.title ?? id;
}

export interface AboutSectionProps {
  id: AboutSectionId;
  /** Overrides the default title from ABOUT_SECTIONS. */
  title?: string;
  children: ReactNode;
  className?: string;
}

/**
 * One anchored section of /about. The heading carries the id so `/about#scoring` lands on it and the
 * heading is reachable via the "#" link (keyboard users can copy the anchor).
 */
export function AboutSection({ id, title, children, className }: AboutSectionProps) {
  const heading = title ?? aboutSectionTitle(id);
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className={clsx('scroll-mt-24 space-y-4', className)}>
      <h2 id={`${id}-heading`} className="group flex items-baseline gap-2 text-xl font-semibold tracking-tight text-ink">
        {heading}
        <a
          href={`#${id}`}
          className="text-sm font-normal text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          aria-label={`Link to section: ${heading}`}
        >
          #
        </a>
      </h2>
      <div className="space-y-4 text-sm leading-6 text-ink-muted [&_a]:text-link [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-surface-sunken [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-ink [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}

/** Sticky table of contents (nav landmark). */
export function AboutToc({ className }: { className?: string }) {
  return (
    <nav aria-label="On this page" className={clsx('text-sm', className)}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">On this page</p>
      <ol className="space-y-1">
        {ABOUT_SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="block rounded px-2 py-1 text-ink-muted hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
