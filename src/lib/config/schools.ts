// School registry (SPEC sections 3.0 and 5). Pure and env-free so both server code and scripts can use
// it; the concrete `School` record served to pages is built by `buildSchool()` from the data mode and
// current term and then persisted to data/processed/<school>/school.json by ingest.
import type { DataMode, School, SchoolId, TermCode } from '@/lib/domain/types';

export interface SchoolSourceIds {
  grades: string;
  schedule: string;
  reviews: string;
}

export interface SchoolBase {
  id: SchoolId;
  name: string;
  shortName: string;
  /** IANA zone every meeting time and stamp is displayed in. */
  timezone: string;
  /** Whether the REAL schedule adapter exposes seat availability. Demo mode always reports true. */
  liveSeatStatusAvailable: boolean;
  /** Adapter ids per data mode (SPEC 6.2). */
  sources: { demo: SchoolSourceIds; live: Omit<SchoolSourceIds, 'reviews'> };
}

export const SCHOOL_IDS: readonly SchoolId[] = ['uiuc'];
export const DEFAULT_SCHOOL_ID: SchoolId = 'uiuc';

export const SCHOOL_REGISTRY: Record<SchoolId, SchoolBase> = {
  uiuc: {
    id: 'uiuc',
    name: 'University of Illinois Urbana-Champaign',
    shortName: 'UIUC',
    timezone: 'America/Chicago',
    liveSeatStatusAvailable: false, // Course Explorer exposes statusCode only — no seats (SOURCE_FACTS §2)
    sources: {
      demo: { grades: 'demo-grades', schedule: 'demo-schedule', reviews: 'demo-reviews' },
      live: { grades: 'uiuc-gpa-csv', schedule: 'uiuc-course-explorer' },
    },
  },
};

export function isSchoolId(value: string | null | undefined): value is SchoolId {
  return typeof value === 'string' && (SCHOOL_IDS as readonly string[]).includes(value.toLowerCase());
}

/** Lower-cases and validates a route segment; null for anything not registered. */
export function toSchoolId(value: string | null | undefined): SchoolId | null {
  if (!isSchoolId(value)) return null;
  return value.toLowerCase() as SchoolId;
}

export type ReviewSourceChoice = 'demo' | 'rmp' | 'none';

export interface BuildSchoolOptions {
  mode: DataMode;
  currentTerm: TermCode;
  /** Live mode only: which review adapter ingest ran with. Ignored in demo mode. */
  reviewSource?: ReviewSourceChoice;
}

/** Build the `School` record for a data mode. Demo: seat status known, demo adapters. Live: real adapters. */
export function buildSchool(schoolId: SchoolId, opts: BuildSchoolOptions): School {
  const base = SCHOOL_REGISTRY[schoolId];
  const live = opts.mode === 'live';
  const reviews = live
    ? opts.reviewSource === 'rmp'
      ? 'rmp-graphql'
      : 'none'
    : base.sources.demo.reviews;
  return {
    id: base.id,
    name: base.name,
    shortName: base.shortName,
    currentTerm: opts.currentTerm,
    timezone: base.timezone,
    seatStatusAvailable: live ? base.liveSeatStatusAvailable : true,
    sources: live
      ? { grades: base.sources.live.grades, schedule: base.sources.live.schedule, reviews }
      : { ...base.sources.demo },
  };
}

/** Directory name under data/processed/ for a school + mode: `uiuc` (demo) or `uiuc-live`. */
export function processedDirName(schoolId: SchoolId, mode: DataMode): string {
  return mode === 'live' ? `${schoolId}-live` : schoolId;
}

/** Label for the "Open seats only" toggle (SPEC F3): live sources cannot see seats. */
export function openToggleLabel(school: Pick<School, 'seatStatusAvailable'>): string {
  return school.seatStatusAvailable ? 'Open seats only' : 'Offered this term';
}
