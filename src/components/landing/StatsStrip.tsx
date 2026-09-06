import type { MetaCounts } from "@/lib/domain/types";
import { formatNumber } from "@/lib/utils/format";

export interface StatsStripProps {
  counts: MetaCounts;
  /** Live sources cannot see seats: the third stat reads "offered sections". */
  seatStatusAvailable?: boolean;
  className?: string;
}

export interface StatItem {
  value: string;
  label: string;
}

/** "{gradeRows} grade rows · {professors} professors · {openSections} open sections · {reviews} reviews" */
export function statsItems(counts: MetaCounts, seatStatusAvailable = true): StatItem[] {
  return [
    { value: formatNumber(counts.gradeRows), label: "grade rows" },
    { value: formatNumber(counts.professors), label: "professors" },
    { value: formatNumber(counts.openSections), label: seatStatusAvailable ? "open sections" : "offered sections" },
    { value: formatNumber(counts.reviews), label: "reviews" },
  ];
}

export function statsText(counts: MetaCounts, seatStatusAvailable = true): string {
  return statsItems(counts, seatStatusAvailable)
    .map((s) => `${s.value} ${s.label}`)
    .join(" · ");
}

/** Dataset size at a glance (SPEC 3.1 §3), from `meta.json`. Server component. */
export function StatsStrip({ counts, seatStatusAvailable = true, className }: StatsStripProps) {
  const items = statsItems(counts, seatStatusAvailable);
  return (
    <section aria-label="Dataset size" className={className}>
      <dl className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
        {items.map((s) => (
          <div key={s.label} className="flex flex-col items-center bg-surface-raised px-3 py-4 text-center">
            <dd className="order-1 text-2xl font-semibold tabular-nums tracking-tight text-ink">{s.value}</dd>
            <dt className="order-2 mt-0.5 text-xs uppercase tracking-wide text-ink-muted">{s.label}</dt>
          </div>
        ))}
      </dl>
      <p className="sr-only">{statsText(counts, seatStatusAvailable)}</p>
    </section>
  );
}

export default StatsStrip;
