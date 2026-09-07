// Per-school UI switches from docs/MULTI_SCHOOL_DESIGN.md (§2, §4.1, §5, §8), read off the `School`
// record every payload carries. The field names are the design-doc contract (`reviewsAvailable`,
// `gradeValueKind`, `gradeBuckets`, `attribution`, `mode`); `resolveSchoolFlags` also derives sane
// values for payloads written before those fields existed (the demo fixtures, an older school.json),
// so every component reads one resolved object instead of probing optional fields.
import type { DataMode, GradeBucketKind, GradeValueKind, School } from "@/lib/domain/types";

export type { GradeBucketKind, GradeValueKind };

export interface SchoolAttribution {
  grades: string;
  schedule?: string;
}

/** The design-doc fields on `School` that drive the UI. */
export interface SchoolFlags {
  mode: DataMode;
  /** false for every real school (no scraped reviews): grades-only UI (design §5). */
  reviewsAvailable: boolean;
  /** "percent" → the source publishes percentages without head counts: say "N sections" (design §4.1). */
  gradeValueKind: GradeValueKind;
  /** What the grade source provides; drives the GradeBar legend (design §4). */
  gradeBuckets: GradeBucketKind;
  /** Footer / about / DataBadge text (design §8). */
  attribution: SchoolAttribution;
}

/** A `School` record (any vintage) — the resolver needs only the id and the adapter ids to fill gaps. */
export type SchoolLike = Pick<School, "id"> & { shortName?: string; sources?: Partial<School["sources"]> | null } & Partial<SchoolFlags>;

export const DEMO_ATTRIBUTION: SchoolAttribution = { grades: "fictional demo data" };

const DEMO_ADAPTER_RE = /^demo(-|$)/;

/** True when the grades adapter id names the fictional generator. */
export function isDemoAdapter(adapterId: string | null | undefined): boolean {
  return typeof adapterId === "string" && DEMO_ADAPTER_RE.test(adapterId);
}

/** Resolve every UI switch for a school; explicit fields win, derived values fill the gaps. */
export function resolveSchoolFlags(school: SchoolLike, overrides: { mode?: DataMode } = {}): SchoolFlags {
  const grades = school.sources?.grades ?? null;
  const reviews = school.sources?.reviews ?? null;
  const mode: DataMode = overrides.mode ?? school.mode ?? (isDemoAdapter(grades) ? "demo" : "live");
  // Unknown provenance (no flag, no adapter ids) keeps the legacy behaviour: the full review UI.
  const reviewsAvailable =
    school.reviewsAvailable ?? (mode === "demo" || reviews === null ? true : typeof reviews === "string" && reviews !== "" && reviews !== "none");
  const label = school.shortName ?? school.id.toUpperCase();
  return {
    mode,
    reviewsAvailable,
    gradeValueKind: school.gradeValueKind ?? "counts",
    gradeBuckets: school.gradeBuckets ?? "plus-minus",
    attribution: school.attribution ?? (mode === "demo" ? DEMO_ATTRIBUTION : { grades: `${label} official grade records` }),
  };
}

/** Grades-only mode is the complement of `reviewsAvailable` (design §5). */
export function isGradesOnly(school: SchoolLike, overrides?: { mode?: DataMode }): boolean {
  return !resolveSchoolFlags(school, overrides).reviewsAvailable;
}
