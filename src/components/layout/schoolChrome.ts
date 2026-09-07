// Everything the site header/footer need per school (design §8: badge and provenance are per school),
// built once in the root layout from school.json + meta.json and handed to the client switches as
// plain props. Pure: no fs, no env — usable from tests and from server components alike.
import type { DataMode, Meta, MetaCounts, School } from "@/lib/domain/types";
import { resolveSchoolFlags, type GradeValueKind, type SchoolAttribution, type SchoolLike } from "./schoolFlags";

export interface SchoolSourceUrls {
  grades: string | null;
  schedule: string | null;
}

export interface SchoolChrome {
  id: string;
  shortName: string;
  mode: DataMode;
  timezone: string;
  reviewsAvailable: boolean;
  /** false → footer counts say "offered sections" (design §8 / SPEC 3.0 live wording). */
  seatStatusAvailable: boolean;
  gradeValueKind: GradeValueKind;
  attribution: SchoolAttribution;
  /** Links for the footer clauses, from `meta.sources` (null when the adapter recorded none). */
  sourceUrls: SchoolSourceUrls;
  builtAt: string | null;
  counts: MetaCounts | null;
  /** Live review adapter label, when one was wired (never for registered schools). */
  reviewsLabel?: string;
}

/** Find the first source whose id or label mentions `word` (e.g. "gpa"/"grade", "schedule"/"explorer"). */
function sourceUrl(meta: Pick<Meta, "sources"> | null, pattern: RegExp): string | null {
  const hit = meta?.sources.find((s) => pattern.test(s.id) || pattern.test(s.label));
  return hit?.url ?? null;
}

/** Fallback when neither school.json nor meta.json exists yet (fresh checkout): grades-only defaults, no counts. */
export function fallbackChrome(id: string, shortName = id.toUpperCase(), timezone = "America/Chicago"): SchoolChrome {
  return {
    id,
    shortName,
    mode: "live",
    timezone,
    reviewsAvailable: false,
    seatStatusAvailable: false,
    gradeValueKind: "counts",
    attribution: resolveSchoolFlags({ id, shortName, sources: null }).attribution,
    sourceUrls: { grades: null, schedule: null },
    builtAt: null,
    counts: null,
  };
}

/** Combine a school record and its meta into the chrome props. Either may be missing. */
export function buildSchoolChrome(
  id: string,
  school: (Pick<School, "shortName" | "timezone"> & Partial<Pick<School, "seatStatusAvailable">> & SchoolLike) | null,
  meta: Meta | null,
  fallback: { shortName?: string; timezone?: string } = {},
): SchoolChrome {
  if (!school && !meta) return fallbackChrome(id, fallback.shortName, fallback.timezone);
  const flags = resolveSchoolFlags(school ?? { id, shortName: fallback.shortName, sources: null }, meta ? { mode: meta.mode } : {});
  const reviewsSource = meta?.sources.find((s) => /review/i.test(s.id) || /review/i.test(s.label));
  return {
    id,
    shortName: school?.shortName ?? fallback.shortName ?? id.toUpperCase(),
    mode: flags.mode,
    timezone: school?.timezone ?? fallback.timezone ?? "America/Chicago",
    reviewsAvailable: flags.reviewsAvailable,
    seatStatusAvailable: school?.seatStatusAvailable ?? false,
    gradeValueKind: flags.gradeValueKind,
    attribution: flags.attribution,
    sourceUrls: {
      grades: sourceUrl(meta, /grade|gpa/i),
      schedule: sourceUrl(meta, /schedule|explorer|section|class/i),
    },
    builtAt: meta?.builtAt ?? null,
    counts: meta?.counts ?? null,
    reviewsLabel: flags.reviewsAvailable ? reviewsSource?.label : undefined,
  };
}
