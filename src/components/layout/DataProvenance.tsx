import type { DataMode, MetaCounts } from "@/lib/domain/types";

export interface DataProvenanceProps {
  mode: DataMode;
  /** ISO UTC (`Meta.builtAt`); null when the repository was unavailable. */
  builtAt: string | null;
  /** `School.timezone`, e.g. "America/Chicago". */
  timezone: string;
  counts: MetaCounts | null;
  /** `Meta.seed` (demo only). */
  seed?: number | null;
  /** Override for the reviews clause in live mode, e.g. "RateMyProfessors (unofficial)". */
  reviewsLabel?: string;
  className?: string;
}

/**
 * Format an ISO timestamp in the school's zone, e.g. "Sep 3, 2026, 9:12 AM CT".
 * Local to the layout module because `src/lib/utils/format.ts` belongs to
 * another module; the two agree on the SPEC 3.0 Intl options.
 */
export function formatStamp(iso: string, timezone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
    const zone =
      new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "short" })
        .formatToParts(d)
        .find((p) => p.type === "timeZoneName")?.value ?? "";
    // "CDT"/"CST" → "CT" per SPEC 3.0 ("… AM CT"); other zones keep their name.
    const shortZone = /^C[SD]T$/.test(zone) ? "CT" : zone;
    return shortZone ? `${parts} ${shortZone}` : parts;
  } catch {
    return d.toISOString();
  }
}

const nf = new Intl.NumberFormat("en-US");

export function formatCounts(counts: MetaCounts): string {
  return [
    `${nf.format(counts.gradeRows)} grade rows`,
    `${nf.format(counts.professors)} professors`,
    `${nf.format(counts.openSections)} open sections`,
    `${nf.format(counts.reviews)} reviews`,
  ].join(" · ");
}

/**
 * SPEC 3.0 footer line:
 * "Grades: UIUC GPA dataset (MIT) · Schedule: UIUC Course Explorer · Reviews:
 *  fictional demo data (seed 20260903) · Built {builtAt} · {counts}"
 */
export function DataProvenance({
  mode,
  builtAt,
  timezone,
  counts,
  seed,
  reviewsLabel,
  className,
}: DataProvenanceProps) {
  const reviews =
    mode === "demo"
      ? `fictional demo data${seed != null ? ` (seed ${seed})` : ""}`
      : (reviewsLabel ?? "none configured");

  const segments: React.ReactNode[] = [
    <span key="grades">
      Grades:{" "}
      <a
        href="https://github.com/wadefagen/datasets"
        rel="noreferrer noopener"
        target="_blank"
        className="underline hover:text-ink"
      >
        UIUC GPA dataset
      </a>{" "}
      (MIT)
    </span>,
    <span key="schedule">
      Schedule:{" "}
      <a
        href="https://courses.illinois.edu/"
        rel="noreferrer noopener"
        target="_blank"
        className="underline hover:text-ink"
      >
        UIUC Course Explorer
      </a>
    </span>,
    <span key="reviews">Reviews: {reviews}</span>,
    <span key="built">
      Built{" "}
      {builtAt ? (
        <time dateTime={builtAt}>{formatStamp(builtAt, timezone)}</time>
      ) : (
        <span>—</span>
      )}
    </span>,
  ];
  if (counts) segments.push(<span key="counts">{formatCounts(counts)}</span>);

  return (
    <p className={className} data-testid="data-provenance">
      {segments.map((s, i) => (
        <span key={i}>
          {i > 0 ? <span aria-hidden="true"> · </span> : null}
          {s}
        </span>
      ))}
    </p>
  );
}

export default DataProvenance;
