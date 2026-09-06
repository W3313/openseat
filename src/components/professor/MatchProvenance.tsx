import Link from "next/link";
import clsx from "clsx";
import type { MatchMethod, MatchProvenance as MatchProvenanceEntry } from "@/lib/domain/types";
import { TOOLTIPS } from "@/lib/copy/tooltips";
import { pluralize } from "@/lib/utils/format";

export interface MatchProvenanceProps {
  provenance: readonly MatchProvenanceEntry[];
  className?: string;
}

const METHOD_ORDER: readonly MatchMethod[] = [
  "alias",
  "exact",
  "first-token",
  "initial",
  "nickname",
  "compound-last",
  "fuzzy",
  "ambiguous",
  "unmatched",
  "blocked",
];

const LINKING: ReadonlySet<MatchMethod> = new Set(["alias", "exact", "first-token", "initial", "nickname", "compound-last", "fuzzy"]);

function countBy(entries: readonly MatchProvenanceEntry[], source: MatchProvenanceEntry["source"]): string {
  const counts = new Map<MatchMethod, number>();
  for (const e of entries) {
    if (e.source !== source || !LINKING.has(e.method)) continue;
    counts.set(e.method, (counts.get(e.method) ?? 0) + e.rows);
  }
  const parts = METHOD_ORDER.filter((m) => counts.has(m)).map((m) => `${counts.get(m)} ${m}`);
  return parts.length ? parts.join(", ") : "none";
}

/** "Grade rows joined: 5 exact, 2 initial · Schedule instructors joined: 1 initial" (SPEC 3.4 item 8). */
export function provenanceHeadline(entries: readonly MatchProvenanceEntry[]): string {
  return `Grade rows joined: ${countBy(entries, "grades")} · Schedule instructors joined: ${countBy(entries, "schedule")}`;
}

/** `"Okonkwo, A" (initial, 2 rows)` */
export function provenanceEntryText(e: MatchProvenanceEntry): string {
  const unit = e.source === "grades" ? "row" : "section";
  return `"${e.instructorRaw}" (${e.method}, ${pluralize(e.rows, unit)})`;
}

/** Sort: linking methods first (by tier), then by rows desc, then raw string. */
export function sortProvenance(entries: readonly MatchProvenanceEntry[]): MatchProvenanceEntry[] {
  return [...entries].sort((a, b) => {
    const s = a.source.localeCompare(b.source);
    if (s !== 0) return s;
    const m = METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method);
    if (m !== 0) return m;
    if (a.rows !== b.rows) return b.rows - a.rows;
    return a.instructorRaw.localeCompare(b.instructorRaw);
  });
}

/** Detail-page provenance block: how this person's grade rows and schedule strings were joined. */
export function MatchProvenance({ provenance, className }: MatchProvenanceProps) {
  const sorted = sortProvenance(provenance);
  return (
    <section id="provenance" aria-labelledby="provenance-heading" className={clsx("flex flex-col gap-2 rounded-card border border-border bg-surface-raised p-4", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="provenance-heading" className="m-0 text-base font-semibold text-ink">
          How the records were joined
        </h2>
        <Link href="/about#matching" className="text-xs font-medium text-link hover:underline">
          Matching tiers →
        </Link>
      </div>
      <p className="m-0 text-sm text-ink">{provenanceHeadline(provenance)}</p>
      {sorted.length ? (
        <ul aria-label="Raw instructor strings" className="m-0 flex flex-wrap gap-1.5 p-0">
          {sorted.map((e) => (
            <li
              key={`${e.source}:${e.instructorRaw}:${e.method}`}
              className={clsx(
                "list-none rounded-md border px-2 py-0.5 font-mono text-xs",
                LINKING.has(e.method) ? "border-border bg-surface-sunken text-ink" : "border-dashed border-border-strong text-ink-muted",
              )}
              title={e.source === "grades" ? "Grade dataset string" : "Schedule string"}
            >
              <span className="mr-1 text-[0.65rem] uppercase tracking-wide text-ink-faint">{e.source}</span>
              {provenanceEntryText(e)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-sm text-ink-muted">No grade rows or schedule strings are linked to this person yet.</p>
      )}
      <p className="m-0 text-xs text-ink-faint">{TOOLTIPS.stats.matchProvenance.text}</p>
    </section>
  );
}

export default MatchProvenance;
