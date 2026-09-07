import clsx from "clsx";
import { Link2 } from "lucide-react";
import type { MatchMethod, MatchProvenance } from "@/lib/domain/types";
import { Tooltip } from "@/components/ui/Tooltip";
import { TOOLTIPS } from "@/lib/copy/tooltips";

export interface MatchProvenanceIconProps {
  provenance: readonly MatchProvenance[];
  className?: string;
}

const METHOD_ORDER: readonly MatchMethod[] = [
  "alias", "exact", "first-token", "initial", "nickname", "compound-last", "fuzzy", "ambiguous", "unmatched", "blocked", "grades-only",
];

/** "Grade rows matched: 5 exact, 2 initial" — grade-source rows only, methods in tier order (pure). */
export function matchProvenanceSummary(provenance: readonly MatchProvenance[]): string {
  const counts = new Map<MatchMethod, number>();
  for (const p of provenance) {
    if (p.source !== "grades") continue;
    if (p.method === "unmatched" || p.method === "ambiguous" || p.method === "blocked" || p.method === "grades-only") continue;
    counts.set(p.method, (counts.get(p.method) ?? 0) + p.rows);
  }
  const parts = METHOD_ORDER.filter((m) => counts.has(m)).map((m) => `${counts.get(m)} ${m}`);
  if (parts.length === 0) return "Grade rows matched: none";
  return `Grade rows matched: ${parts.join(", ")}`;
}

/**
 * Small link glyph whose tooltip explains how the grade rows were joined to
 * this person (SPEC 3.2 item 5, F21). Rendered as a button so it is focusable.
 */
export function MatchProvenanceIcon({ provenance, className }: MatchProvenanceIconProps) {
  const summary = matchProvenanceSummary(provenance);
  return (
    <Tooltip
      content={
        <span>
          <span className="block font-medium">{summary}</span>
          <span className="block text-ink-muted">{TOOLTIPS.stats.matchProvenance.text}</span>
        </span>
      }
      className={className}
    >
      <button
        type="button"
        aria-label={summary}
        className={clsx(
          "inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-faint hover:bg-surface-sunken hover:text-ink",
        )}
      >
        <Link2 aria-hidden="true" className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}

export default MatchProvenanceIcon;
