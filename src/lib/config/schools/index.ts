// School registry — the single source of truth for schools (MULTI_SCHOOL_DESIGN §2). Env-free and fs-free
// so both server code, scripts and client components can import it. The only environment touch is the
// SCHOOLS allowlist, read straight from process.env (no zod, no dotenv) so this module stays client-safe;
// src/lib/config/env.ts validates the same variable for server code.
//
//   REGISTERED_SCHOOL_IDS   every school the code knows about (registry order)
//   SCHOOL_IDS              the enabled subset (SCHOOLS env allowlist; default: all registered)
//   toSchoolId(v)           route/lookup entry point → enabled id or null
//   toRegisteredSchoolId(v) scripts (--school works for any registered id, enabled or not)
//   getSchoolConfig(id)     registry entry (throws on unknown)
//   buildSchool(config)     the School record served to pages (persisted to school.json by ingest)
import type { DataMode, School, SchoolId, TermCode } from '@/lib/domain/types';
import type { SchoolConfig } from './types';
import { SCHOOL_ID_RE } from './types';
import { UIUC } from './uiuc';
import { PURDUE } from './purdue';
import { UH } from './uh';

export type { SchoolConfig, SchoolSources, SourceSpec } from './types';
export { SCHOOL_ID_RE } from './types';
export { UIUC, UIUC_SUBJECTS } from './uiuc';
export { PURDUE, PURDUE_SUBJECTS, PURDUE_OVERSIZED_SUBJECTS } from './purdue';
export { UH, UH_SUBJECTS } from './uh';

/** Registry order = landing-page order. Every entry is a real, grades-only school (UC Santa Barbara, UT Dallas and the fictional demo school were removed 2026-09-06). */
const REGISTRY: readonly SchoolConfig[] = [UIUC, PURDUE, UH];

const ids = REGISTRY.map((c) => c.id);
if (new Set(ids).size !== ids.length) throw new Error(`Duplicate school id in registry: ${ids.join(', ')}`);

for (const c of REGISTRY) {
  if (!SCHOOL_ID_RE.test(c.id)) throw new Error(`SchoolConfig id "${c.id}" must match ${SCHOOL_ID_RE}`);
}

export const SCHOOL_CONFIGS: Readonly<Record<string, SchoolConfig>> = Object.freeze(
  Object.fromEntries(REGISTRY.map((c) => [c.id, c])),
);

export const REGISTERED_SCHOOL_IDS: readonly SchoolId[] = Object.freeze(REGISTRY.map((c) => c.id));

export function isRegisteredSchoolId(value: string | null | undefined): value is SchoolId {
  return typeof value === 'string' && Object.hasOwn(SCHOOL_CONFIGS, value.toLowerCase());
}

/** Lower-cases and validates against the whole registry (scripts: `--school` accepts any registered id). */
export function toRegisteredSchoolId(value: string | null | undefined): SchoolId | null {
  return isRegisteredSchoolId(value) ? value.toLowerCase() : null;
}

/**
 * SCHOOLS env allowlist ("uiuc,purdue") → enabled ids in registry order. Unknown ids are ignored; an
 * empty/undefined value enables every registered school.
 */
export function parseSchoolsAllowlist(raw: string | null | undefined): SchoolId[] {
  const wanted = new Set(
    (raw ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  if (wanted.size === 0) return [...REGISTERED_SCHOOL_IDS];
  return REGISTERED_SCHOOL_IDS.filter((id) => wanted.has(id));
}

/** Enabled ids evaluated now (scripts that run before dotenv loading should prefer env.SCHOOLS). */
export function enabledSchoolIds(source: { SCHOOLS?: string } = process.env as { SCHOOLS?: string }): SchoolId[] {
  const list = parseSchoolsAllowlist(source.SCHOOLS);
  return list.length > 0 ? list : [...REGISTERED_SCHOOL_IDS];
}

/** Schools selected by the SCHOOLS allowlist at module load (ingested, statically generated, listed on the landing page). */
export const SCHOOL_IDS: readonly SchoolId[] = Object.freeze(enabledSchoolIds());

export const DEFAULT_SCHOOL_ID: SchoolId = SCHOOL_IDS[0] ?? REGISTERED_SCHOOL_IDS[0];

export function isSchoolId(value: string | null | undefined): value is SchoolId {
  return typeof value === 'string' && (SCHOOL_IDS as readonly string[]).includes(value.toLowerCase());
}

/** Lower-cases and validates a route segment against the ENABLED schools; null for anything else. */
export function toSchoolId(value: string | null | undefined): SchoolId | null {
  return isSchoolId(value) ? value.toLowerCase() : null;
}

export function findSchoolConfig(schoolId: string | null | undefined): SchoolConfig | null {
  const id = toRegisteredSchoolId(schoolId);
  return id ? SCHOOL_CONFIGS[id] : null;
}

/** Registry entry for a school id; throws a clear error for an unknown id. */
export function getSchoolConfig(schoolId: string): SchoolConfig {
  const config = findSchoolConfig(schoolId);
  if (!config) throw new Error(`Unknown school "${schoolId}" (registered: ${REGISTERED_SCHOOL_IDS.join(', ')})`);
  return config;
}

/** Enabled configs in registry order. */
export function enabledSchoolConfigs(): SchoolConfig[] {
  return SCHOOL_IDS.map((id) => SCHOOL_CONFIGS[id]);
}

/** Absolute-agnostic config directory: `configDir` override or data/config/<id> (relative to cwd). */
export function schoolConfigDir(config: SchoolConfig): string {
  return config.configDir ?? `data/config/${config.id}`;
}

export interface BuildSchoolOptions {
  /** Override the registry's currentTerm (ingest passes the term the schedule source actually served). */
  currentTerm?: TermCode;
}

/** The `School` record served to pages, derived from the registry entry. */
export function buildSchool(config: SchoolConfig, opts: BuildSchoolOptions = {}): School {
  return {
    id: config.id,
    name: config.name,
    shortName: config.shortName,
    mode: config.mode,
    currentTerm: opts.currentTerm ?? config.currentTerm,
    timezone: config.timezone,
    seatStatusAvailable: config.seatStatusAvailable,
    reviewsAvailable: config.sources.reviews !== null,
    gradeBuckets: config.gradeBuckets,
    gradeValueKind: config.gradeValueKind,
    attribution: { ...config.attribution },
    sources: {
      grades: config.sources.grades.kind,
      schedule: config.sources.schedule?.kind ?? 'none',
      reviews: config.sources.reviews?.kind ?? 'none',
    },
  };
}

/**
 * Directory name under data/processed/ for a school. One directory per school id (MULTI_SCHOOL_DESIGN §3);
 * the former `<school>-live` split is gone. The optional second argument is accepted for source
 * compatibility with older callers and ignored.
 */
export function processedDirName(schoolId: SchoolId, _mode?: DataMode): string {
  void _mode;
  return schoolId;
}

/** Label for the "Open seats only" toggle (SPEC F3): sources without seat data can only say "offered". */
export function openToggleLabel(school: Pick<School, 'seatStatusAvailable'>): string {
  return school.seatStatusAvailable ? 'Open seats only' : 'Offered this term';
}

/** True when the school ranks by reviews as well as grades (no registered school today; first-party reviews later). */
export function reviewsAvailableFor(school: Pick<School, 'reviewsAvailable'> | SchoolConfig): boolean {
  return 'reviewsAvailable' in school ? school.reviewsAvailable : school.sources.reviews !== null;
}
