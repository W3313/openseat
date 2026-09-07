import type { DataMode, MetaCounts } from "@/lib/domain/types";
import type { SchoolAttribution } from "./schoolFlags";
import type { SchoolSourceUrls } from "./schoolChrome";

export interface DataProvenanceProps {
  mode: DataMode;
  /** `School.attribution` (design §2/§8) — the text of the grades and schedule clauses. */
  attribution: SchoolAttribution;
  /** Links for those clauses, from `meta.sources`; omitted or null → plain text. */
  sourceUrls?: Partial<SchoolSourceUrls>;
  /** false → the reviews clause reads "none (official grade data only)" and the counts omit reviews. Default true. */
  reviewsAvailable?: boolean;
  /** ISO UTC (`Meta.builtAt`); null when the repository was unavailable. */
  builtAt: string | null;
  /** `School.timezone`, e.g. "America/Chicago". */
  timezone: string;
  counts: MetaCounts | null;
  /** `Meta.seed` (demo only). */
  seed?: number | null;
  /** Override for the reviews clause in live mode, e.g. "RateMyProfessors (unofficial)". */
  reviewsLabel?: string;
  /** `School.seatStatusAvailable`: false → the counts say "offered sections" (the API exposes no seats). Default true. */
  seatStatusAvailable?: boolean;
  /** Named in the sr text, e.g. "UIUC". */
  shortName?: string;
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

/**
 * "1,812 grade rows · 92 professors · 118 open sections · 1,304 reviews" (reviews omitted for grades-only
 * schools; "offered sections" when the schedule source exposes no seat status).
 */
export function formatCounts(counts: MetaCounts, reviewsAvailable = true, seatStatusAvailable = true): string {
  const parts = [
    `${nf.format(counts.gradeRows)} grade rows`,
    `${nf.format(counts.professors)} professors`,
    `${nf.format(counts.openSections)} ${seatStatusAvailable ? "open" : "offered"} sections`,
  ];
  if (reviewsAvailable) parts.push(`${nf.format(counts.reviews)} reviews`);
  return parts.join(" · ");
}

/** The reviews clause: "fictional demo data (seed N)" | "<adapter label>" | "none (official grade data only)". */
export function reviewsClause(mode: DataMode, reviewsAvailable: boolean, seed?: number | null, reviewsLabel?: string): string {
  if (mode === "demo") return `fictional demo data${seed != null ? ` (seed ${seed})` : ""}`;
  if (!reviewsAvailable) return "none (official grade data only)";
  return reviewsLabel ?? "none configured";
}

function SourceLink({ href, children }: { href: string | null | undefined; children: React.ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <a href={href} rel="noreferrer noopener" target="_blank" className="underline hover:text-ink">
      {children}
    </a>
  );
}

/**
 * Footer line (SPEC 3.0, per school per design §8):
 * "Grades: UIUC GPA dataset · Schedule: UIUC Course Explorer · Reviews: none (official grade data only) ·
 *  Built {builtAt} · {counts}"
 */
export function DataProvenance({
  mode,
  attribution,
  sourceUrls,
  reviewsAvailable = true,
  builtAt,
  timezone,
  counts,
  seed,
  reviewsLabel,
  seatStatusAvailable = true,
  shortName,
  className,
}: DataProvenanceProps) {
  const segments: React.ReactNode[] = [
    <span key="grades">
      Grades: <SourceLink href={sourceUrls?.grades}>{attribution.grades}</SourceLink>
    </span>,
  ];
  if (attribution.schedule) {
    segments.push(
      <span key="schedule">
        Schedule: <SourceLink href={sourceUrls?.schedule}>{attribution.schedule}</SourceLink>
      </span>,
    );
  }
  segments.push(
    <span key="reviews">Reviews: {reviewsClause(mode, reviewsAvailable, seed, reviewsLabel)}</span>,
    <span key="built">
      Built {builtAt ? <time dateTime={builtAt}>{formatStamp(builtAt, timezone)}</time> : <span>—</span>}
    </span>,
  );
  if (counts) segments.push(<span key="counts">{formatCounts(counts, reviewsAvailable, seatStatusAvailable)}</span>);

  return (
    <p className={className} data-testid="data-provenance" data-school={shortName}>
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
