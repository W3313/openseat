// Adapter registry (MULTI_SCHOOL_DESIGN §2, §7). Adapters are resolved PER SCHOOL from
// SchoolConfig.sources.{grades,schedule,reviews}.kind — there is no global DATA_MODE any more.
//
// Adapter kinds live in a map that adapter modules extend from their own `src/lib/sources/<school>/register.ts`:
//
//   import { registerGradeSource } from '@/lib/sources/registry';
//   registerGradeSource('uh-cougargrades', (ctx) => new UhGradeSource({ ...ctx.options, log: ctx.log }));
//
// `src/lib/sources/adapters.ts` is the generated list of every register.ts (side-effect imports); this
// module imports it so any consumer of getSources() sees every kind. The import graph is intentionally
// cyclic (registry → adapters → <school>/register → registry): the register* functions are hoisted
// function declarations backed by a globalThis map, so a register.ts evaluated mid-cycle never hits a TDZ.
import type { SchoolId } from '@/lib/domain/types';
import type { Env } from '@/lib/config/env';
import { getSchoolConfig, type SchoolConfig, type SourceSpec } from '@/lib/config/schools';
import type { GradeSource, RawProfessor, RawReview, RawSection, ReviewSource, ScheduleSource, SourceInfo } from './types';
import type { TermCode } from '@/lib/domain/types';
import './adapters';

export interface Sources {
  grades: GradeSource;
  schedule: ScheduleSource;
  reviews: ReviewSource;
}

export interface RegistryLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

export interface RegistryOptions {
  /** Schedule adapters with a raw cache: bypass it (scripts pass --refresh). */
  refresh?: boolean;
  log?: RegistryLogger;
}

/** What every adapter factory receives. `options` is the SourceSpec minus `kind`. */
export interface AdapterContext {
  schoolId: SchoolId;
  config: SchoolConfig;
  env: Env;
  options: Record<string, unknown>;
  refresh: boolean;
  log?: RegistryLogger;
}

export type GradeSourceFactory = (ctx: AdapterContext) => GradeSource;
export type ScheduleSourceFactory = (ctx: AdapterContext) => ScheduleSource;
export type ReviewSourceFactory = (ctx: AdapterContext) => ReviewSource;

interface AdapterKinds {
  grades: Map<string, GradeSourceFactory>;
  schedule: Map<string, ScheduleSourceFactory>;
  reviews: Map<string, ReviewSourceFactory>;
}

/**
 * The one map of registered kinds, kept on globalThis so it exists before any module body runs. No
 * module-level `const` may be touched here: a register.ts evaluated mid-cycle runs before this module's
 * body, and only hoisted function declarations are safe to call then.
 */
function kinds(): AdapterKinds {
  const key = Symbol.for('profpeek.adapterKinds');
  const g = globalThis as unknown as Record<symbol, AdapterKinds | undefined>;
  if (!g[key]) g[key] = { grades: new Map(), schedule: new Map(), reviews: new Map() };
  return g[key];
}

export function registerGradeSource(kind: string, factory: GradeSourceFactory): void {
  kinds().grades.set(kind, factory);
}
export function registerScheduleSource(kind: string, factory: ScheduleSourceFactory): void {
  kinds().schedule.set(kind, factory);
}
export function registerReviewSource(kind: string, factory: ReviewSourceFactory): void {
  kinds().reviews.set(kind, factory);
}

/** Registered kinds (sorted) — for error messages, /about and tests. */
export function registeredAdapterKinds(): { grades: string[]; schedule: string[]; reviews: string[] } {
  const k = kinds();
  return {
    grades: [...k.grades.keys()].sort(),
    schedule: [...k.schedule.keys()].sort(),
    reviews: [...k.reviews.keys()].sort(),
  };
}

// ── null adapters (schools without a schedule or review source) ──────────────────────────────────────
export const NULL_REVIEW_SOURCE_INFO: SourceInfo = { id: 'none', label: 'No review source', url: null, license: null };
export const NULL_SCHEDULE_SOURCE_INFO: SourceInfo = { id: 'none', label: 'No schedule source', url: null, license: null };

/** No professors, no reviews — rankings are grades-only (MULTI_SCHOOL_DESIGN §5). */
export class NullReviewSource implements ReviewSource {
  readonly info = NULL_REVIEW_SOURCE_INFO;
  async fetchProfessors(): Promise<RawProfessor[]> {
    return [];
  }
  async fetchReviews(): Promise<RawReview[]> {
    return [];
  }
}

/** No sections at all (schools without a schedule source); the requested term is echoed back. */
export class NullScheduleSource implements ScheduleSource {
  readonly info = NULL_SCHEDULE_SOURCE_INFO;
  async fetchSections(opts: { schoolId: SchoolId; term: TermCode; subject: string }): Promise<{ term: TermCode; fetchedAt: string; sections: RawSection[] }> {
    return { term: opts.term, fetchedAt: '', sections: [] }; // '' = no fetch happened (ingest falls back to builtAt)
  }
}

// ── resolution ───────────────────────────────────────────────────────────────────────────────────────
function context(schoolId: SchoolId, env: Env, spec: SourceSpec, opts: RegistryOptions): AdapterContext {
  const config = getSchoolConfig(schoolId);
  const { kind: _kind, ...options } = spec;
  void _kind;
  return { schoolId: config.id, config, env, options, refresh: opts.refresh ?? false, log: opts.log };
}

function unknownKind(role: keyof AdapterKinds, kind: string, schoolId: string): Error {
  const known = registeredAdapterKinds()[role];
  return new Error(`No ${role} adapter registered for kind "${kind}" (school "${schoolId}"). Registered: ${known.join(', ') || 'none'}`);
}

/** Grade adapter for a school (every school has one). */
export function getGradeSource(schoolId: SchoolId, env: Env, opts: RegistryOptions = {}): GradeSource {
  const config = getSchoolConfig(schoolId);
  const spec = config.sources.grades;
  const factory = kinds().grades.get(spec.kind);
  if (!factory) throw unknownKind('grades', spec.kind, config.id);
  return factory(context(config.id, env, spec, opts));
}

/** Schedule adapter, or NullScheduleSource when the registry entry has `schedule: null`. */
export function getScheduleSource(schoolId: SchoolId, env: Env, opts: RegistryOptions = {}): ScheduleSource {
  const config = getSchoolConfig(schoolId);
  const spec = config.sources.schedule;
  if (!spec) return new NullScheduleSource();
  const factory = kinds().schedule.get(spec.kind);
  if (!factory) throw unknownKind('schedule', spec.kind, config.id);
  return factory(context(config.id, env, spec, opts));
}

/** Review adapter, or NullReviewSource when `reviews: null` (every registered school — docs/LEGAL.md). */
export function getReviewSource(schoolId: SchoolId, env: Env, opts: RegistryOptions = {}): ReviewSource {
  const config = getSchoolConfig(schoolId);
  const spec = config.sources.reviews;
  if (!spec) return new NullReviewSource();
  const factory = kinds().reviews.get(spec.kind);
  if (!factory) throw unknownKind('reviews', spec.kind, config.id);
  return factory(context(config.id, env, spec, opts));
}

/** All three adapters for a school, resolved from its SchoolConfig. */
export function getSources(schoolId: SchoolId, env: Env, opts: RegistryOptions = {}): Sources {
  return {
    grades: getGradeSource(schoolId, env, opts),
    schedule: getScheduleSource(schoolId, env, opts),
    reviews: getReviewSource(schoolId, env, opts),
  };
}
