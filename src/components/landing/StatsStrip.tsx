import type { MetaCounts } from "@/lib/domain/types";
import { formatNumber } from "@/lib/utils/format";

export interface StatsStripProps {
  /** Summed over every school with data (design §8 landing). */
  counts: MetaCounts;
  /** Live sources cannot see seats: the third stat reads "offered sections". */
  seatStatusAvailable?: boolean;
  /** false when no listed school has reviews: the reviews stat is dropped. Default true. */
  reviewsAvailable?: boolean;
  /** Number of schools the counts span; > 1 adds "across N schools". */
  schoolCount?: number;
  className?: string;
}

export interface StatItem {
  value: string;
  label: string;
}

/** Sum `MetaCounts` over several schools (missing entries are skipped). */
export function sumCounts(all: readonly (MetaCounts | null | undefined)[]): MetaCounts | null {
  const present = all.filter((c): c is MetaCounts => c != null);
  if (present.length === 0) return null;
  const keys: (keyof MetaCounts)[] = [
    "professors", "reviewedProfessors", "gradesOnlyProfessors", "gradeRows", "courses", "sections", "openSections",
    "reviews", "summariesClaude", "summariesExtractive", "summariesOpenAiCompatible",
  ];
  const out = {} as Record<keyof MetaCounts, number>;
  for (const k of keys) out[k] = present.reduce((s, c) => s + (c[k] ?? 0), 0);
  return out as MetaCounts;
}

/** "{gradeRows} grade rows · {professors} professors · {openSections} open sections · {reviews} reviews" */
export function statsItems(counts: MetaCounts, seatStatusAvailable = true, reviewsAvailable = true): StatItem[] {
  const items: StatItem[] = [
    { value: formatNumber(counts.gradeRows), label: "grade rows" },
    { value: formatNumber(counts.professors), label: "professors" },
    { value: formatNumber(counts.openSections), label: seatStatusAvailable ? "open sections" : "offered sections" },
  ];
  if (reviewsAvailable) items.push({ value: formatNumber(counts.reviews), label: "reviews" });
  return items;
}

export function statsText(counts: MetaCounts, seatStatusAvailable = true, reviewsAvailable = true): string {
  return statsItems(counts, seatStatusAvailable, reviewsAvailable)
    .map((s) => `${s.value} ${s.label}`)
    .join(" · ");
}

/** Dataset size at a glance (SPEC 3.1 §3), from every school's `meta.json`. Server component. */
export function StatsStrip({ counts, seatStatusAvailable = true, reviewsAvailable = true, schoolCount = 1, className }: StatsStripProps) {
  const items = statsItems(counts, seatStatusAvailable, reviewsAvailable);
  const cols = items.length === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3";
  return (
    <section aria-label="Dataset size" className={className}>
      <dl className={`mx-auto grid w-full max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border ${cols}`}>
        {items.map((s) => (
          <div key={s.label} className="flex flex-col items-center bg-surface-raised px-3 py-4 text-center">
            <dd className="order-1 text-2xl font-semibold tabular-nums tracking-tight text-ink">{s.value}</dd>
            <dt className="order-2 mt-0.5 text-xs uppercase tracking-wide text-ink-muted">{s.label}</dt>
          </div>
        ))}
      </dl>
      <p className="sr-only">{statsText(counts, seatStatusAvailable, reviewsAvailable)}</p>
      {schoolCount > 1 ? (
        <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-ink-faint">across {schoolCount} schools</p>
      ) : null}
    </section>
  );
}

export default StatsStrip;
