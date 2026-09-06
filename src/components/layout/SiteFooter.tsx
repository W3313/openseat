import Link from "next/link";
import type { DataMode, MetaCounts } from "@/lib/domain/types";
import { DataProvenance } from "./DataProvenance";
import { GITHUB_URL } from "./SiteHeader";

export interface SiteFooterProps {
  mode: DataMode;
  builtAt: string | null;
  timezone: string;
  counts: MetaCounts | null;
  seed?: number | null;
  reviewsLabel?: string;
}

/** Footer on every page (F14): provenance line + methodology/licensing links. */
export function SiteFooter({ mode, builtAt, timezone, counts, seed, reviewsLabel }: SiteFooterProps) {
  return (
    <footer className="mt-auto border-t border-border bg-surface-sunken/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-ink-muted sm:px-6">
        <DataProvenance
          mode={mode}
          builtAt={builtAt}
          timezone={timezone}
          counts={counts}
          seed={seed}
          reviewsLabel={reviewsLabel}
          className="leading-relaxed"
        />
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href="/about" className="hover:text-ink hover:underline">
            How it works
          </Link>
          <Link href="/about#demo" className="hover:text-ink hover:underline">
            Fictional-data disclosure
          </Link>
          <Link href="/about#licensing" className="hover:text-ink hover:underline">
            Licensing
          </Link>
          <Link href="/about#privacy" className="hover:text-ink hover:underline">
            Privacy
          </Link>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer noopener" className="hover:text-ink hover:underline">
            Source on GitHub
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <span className="ml-auto">
            ProfPeek is an independent project and is not affiliated with any university.
          </span>
        </nav>
      </div>
    </footer>
  );
}

export default SiteFooter;
