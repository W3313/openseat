// Adapter selection by environment (SPEC 6.2 "src/lib/sources/registry.ts").
//   demo → DemoGradeSource + DemoScheduleSource + DemoReviewSource
//   live → UiucGpaCsvSource + CourseExplorerSource + (RmpReviewSource if RMP_ENABLED else NullReviewSource)
// Guard: DATA_MODE=live with REVIEW_SOURCE=demo is refused — real instructors are never joined with
// fictional reviews.
import type { SchoolId } from '@/lib/domain/types';
import type { Env } from '@/lib/config/env';
import type { GradeSource, RawProfessor, RawReview, ReviewSource, ScheduleSource, SourceInfo } from './types';
import { DemoGradeSource } from './demo/DemoGradeSource';
import { DemoScheduleSource } from './demo/DemoScheduleSource';
import { DemoReviewSource } from './demo/DemoReviewSource';
import { UiucGpaCsvSource } from './uiuc/UiucGpaCsvSource';
import { CourseExplorerSource } from './uiuc/CourseExplorerSource';
import { RmpReviewSource } from './rmp/RmpReviewSource';

export interface Sources {
  grades: GradeSource;
  schedule: ScheduleSource;
  reviews: ReviewSource;
}

/** Thrown by getSources()/getReviewSource() when DATA_MODE=live is combined with REVIEW_SOURCE=demo. */
export const REFUSE_MIXED_SOURCES_MESSAGE = 'Refusing to join real instructors with fictional reviews';

export const NULL_REVIEW_SOURCE_INFO: SourceInfo = { id: 'none', label: 'No review source', url: null, license: null };

/** Live mode without RMP: no professors, no reviews — rankings degrade to grades-only entities. */
export class NullReviewSource implements ReviewSource {
  readonly info = NULL_REVIEW_SOURCE_INFO;
  async fetchProfessors(): Promise<RawProfessor[]> {
    return [];
  }
  async fetchReviews(): Promise<RawReview[]> {
    return [];
  }
}

export interface RegistryOptions {
  /** CourseExplorerSource: bypass the raw XML cache (scripts pass --refresh). */
  refresh?: boolean;
  log?: { info: (msg: string) => void; warn: (msg: string) => void };
}

function assertSchool(schoolId: SchoolId): void {
  if (schoolId !== 'uiuc') throw new Error(`No adapters registered for school "${schoolId}"`);
}

function assertNotMixed(env: Env): void {
  if (env.DATA_MODE === 'live' && env.REVIEW_SOURCE === 'demo') throw new Error(REFUSE_MIXED_SOURCES_MESSAGE);
}

/**
 * Adapters selected by env.DATA_MODE: demo → the three demo adapters; live → UiucGpaCsvSource,
 * CourseExplorerSource, and RmpReviewSource when RMP_ENABLED=1 (else a NullReviewSource returning []).
 */
export function getSources(schoolId: SchoolId, env: Env, opts: RegistryOptions = {}): Sources {
  assertSchool(schoolId);
  assertNotMixed(env);
  if (env.DATA_MODE === 'demo') {
    return {
      grades: getGradeSource(schoolId, env, opts),
      schedule: getScheduleSource(schoolId, env, opts),
      reviews: getReviewSource(schoolId, env, opts),
    };
  }
  const reviews: ReviewSource =
    env.RMP_ENABLED && env.REVIEW_SOURCE === 'rmp' ? buildRmp(env, opts) : new NullReviewSource();
  if (env.REVIEW_SOURCE === 'rmp' && !env.RMP_ENABLED) {
    opts.log?.warn('REVIEW_SOURCE=rmp but RMP_ENABLED is not 1 — using no review source');
  }
  return { grades: getGradeSource(schoolId, env, opts), schedule: getScheduleSource(schoolId, env, opts), reviews };
}

/** Review adapter alone (RMP requires RMP_ENABLED=1 AND DATA_MODE=live; otherwise throws a clear error). */
export function getReviewSource(schoolId: SchoolId, env: Env, opts: RegistryOptions = {}): ReviewSource {
  assertSchool(schoolId);
  assertNotMixed(env);
  if (env.DATA_MODE === 'demo') {
    if (env.REVIEW_SOURCE === 'none') return new NullReviewSource();
    if (env.REVIEW_SOURCE === 'rmp') {
      throw new Error('RmpReviewSource requires DATA_MODE=live (RMP reviews are never mixed into demo data)');
    }
    return new DemoReviewSource({ seed: env.DEMO_SEED, log: opts.log });
  }
  if (env.REVIEW_SOURCE === 'none') return new NullReviewSource();
  if (!env.RMP_ENABLED) {
    throw new Error('RmpReviewSource requires RMP_ENABLED=1 (and DATA_MODE=live); set REVIEW_SOURCE=none to run without reviews');
  }
  return buildRmp(env, opts);
}

export function getGradeSource(schoolId: SchoolId, env: Env, opts: RegistryOptions = {}): GradeSource {
  assertSchool(schoolId);
  if (env.DATA_MODE === 'demo') {
    return new DemoGradeSource({
      seed: env.DEMO_SEED, currentTerm: env.CURRENT_TERM, yearsBack: env.GRADE_YEARS_BACK, log: opts.log,
    });
  }
  return new UiucGpaCsvSource({ currentTerm: env.CURRENT_TERM, yearsBack: env.GRADE_YEARS_BACK, log: opts.log });
}

export function getScheduleSource(schoolId: SchoolId, env: Env, opts: RegistryOptions = {}): ScheduleSource {
  assertSchool(schoolId);
  if (env.DATA_MODE === 'demo') return new DemoScheduleSource({ seed: env.DEMO_SEED });
  return new CourseExplorerSource({
    baseUrl: env.UIUC_COURSE_EXPLORER_BASE,
    concurrency: env.SCHEDULE_FETCH_CONCURRENCY,
    delayMs: env.SCHEDULE_FETCH_DELAY_MS,
    refresh: opts.refresh,
    log: opts.log,
  });
}

function buildRmp(env: Env, opts: RegistryOptions): RmpReviewSource {
  return new RmpReviewSource({ schoolId: env.RMP_SCHOOL_ID, authHeader: env.RMP_AUTH_HEADER, log: opts.log });
}
