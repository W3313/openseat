import Link from "next/link";
import type { ReactNode } from "react";

export interface HowItWorksTile {
  id: "join" | "score" | "summarize";
  title: string;
  body: string;
  href: string;
  icon: ReactNode;
}

const ICON = "h-5 w-5";

export const HOW_IT_WORKS_TILES: readonly HowItWorksTile[] = [
  {
    id: "join",
    title: "Join",
    body:
      "Official grade rows are matched to this term's sections — and to reviews where a school has them — by a fuzzy name matcher; every match keeps its provenance (exact, initial, fuzzy…).",
    href: "/about#matching",
    icon: (
      <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19" />
      </svg>
    ),
  },
  {
    id: "score",
    title: "Score",
    body:
      "GPA is compared to the same course taught by others (leave-one-out), so a 100-level instructor never looks easier than a 400-level one. Where reviews exist, ratings are shrunk toward the subject average so one 5-star review can't win.",
    href: "/about#scoring",
    icon: (
      <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    id: "summarize",
    title: "Summarize",
    body:
      "On schools with reviews (the demo today), Claude turns them into a structured verdict (strengths, watch-outs, workload). With no API key, a deterministic extractive summary stands in — always labelled.",
    href: "/about#ai",
    icon: (
      <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 5h16M4 10h16M4 15h10M4 20h6" />
      </svg>
    ),
  },
];

export interface HowItWorksProps {
  className?: string;
}

/** Three tiles: Join, Score, Summarize (SPEC 3.1 §4). Server component. */
export function HowItWorks({ className }: HowItWorksProps) {
  return (
    <section aria-labelledby="how-heading" className={className}>
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        <h2 id="how-heading" className="text-lg font-semibold text-ink">
          How it works
        </h2>
        <ol className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {HOW_IT_WORKS_TILES.map((tile, i) => (
            <li key={tile.id} className="flex flex-col rounded-xl border border-border bg-surface-raised p-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  {tile.icon}
                </span>
                <h3 className="text-base font-semibold text-ink">
                  <span className="mr-1.5 text-ink-faint tabular-nums">{i + 1}.</span>
                  {tile.title}
                </h3>
              </div>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">{tile.body}</p>
              <Link href={tile.href} className="mt-4 text-sm font-medium text-link hover:underline">
                Read the methodology<span className="sr-only">: {tile.title}</span> →
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default HowItWorks;
