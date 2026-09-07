// SchoolConfig — the registry entry shape (MULTI_SCHOOL_DESIGN §2). Pure types; no env, no fs, so client
// components may import this module. The served `School` record (src/lib/domain/types.ts) is derived
// from a SchoolConfig by `buildSchool()` in ./index.ts and persisted to data/processed/<school>/school.json.
import type { DataMode, GradeBucketKind, GradeValueKind, TermCode } from '@/lib/domain/types';

/** Adapter id plus adapter-specific options, e.g. `{ kind: 'uiuc-gpa-csv' }` or `{ kind: 'purdue-boiler-grades', terms: [...] }`. */
export interface SourceSpec {
  kind: string;
  [option: string]: unknown;
}

export interface SchoolSources {
  grades: SourceSpec;
  schedule: SourceSpec | null;
  /** Always null for real schools (docs/LEGAL.md); the demo school wires the fictional review adapter. */
  reviews: SourceSpec | null;
}

export interface SchoolConfig {
  /** 'uiuc' | 'tamu' | 'utexas' | ... | 'demo' — lowercase, /^[a-z0-9-]{2,12}$/. */
  id: string;
  name: string;
  shortName: string;
  /** IANA zone every meeting time and stamp is displayed in. */
  timezone: string;
  /** Per school; replaces the global DATA_MODE. 'demo' only for the fictional dataset. */
  mode: DataMode;
  currentTerm: TermCode;
  /** Subject allowlist for ingest + static generation (size budget, §6); 'all' = every subject the source has. */
  subjects: string[] | 'all';
  sources: SchoolSources;
  /** True only when the schedule source exposes seat availability (demo, uh). */
  seatStatusAvailable: boolean;
  /** What the grade source publishes (§4). */
  gradeBuckets: GradeBucketKind;
  /** counts (students) vs percent (§4.1: Purdue, Georgia Tech, UCSD). */
  gradeValueKind: GradeValueKind;
  /** Footer / about text. */
  attribution: { grades: string; schedule?: string };
  /**
   * Directory holding departments.json / course-priors.json etc. for this school (default data/config/<id>).
   * The demo school reuses UIUC's catalog config ("fictional professors on the UIUC catalog").
   */
  configDir?: string;
}

export const SCHOOL_ID_RE = /^[a-z0-9-]{2,12}$/;
