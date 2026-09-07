// Deterministic fictional dataset generator (SPEC 6.5). Pure: every random draw goes through ONE
// mulberry32(seed) instance, all iteration is over sorted keys, and serialization goes through
// stableStringify, so `generateDemoSeed(opts)` yields identical bytes on every run.
//
// Public surface used by scripts/seed-demo.ts, the demo adapters and tests/unit/seedDeterminism.test.ts:
//   generateDemoSeed(opts)      → SeedResult (in-memory rows/sections/professors/reviews/meta)
//   serializeSeed(result)       → SeedFiles (file name → contents, exactly what lands in data/raw/demo/demo)
//   seedHash(files)             → sha256 hex over the files in SEED_FILE_ORDER (contents of seed-hash.txt)
//   buildDemoSeed(runtime)      → loads data/config/uiuc/* and runs the three above
import type { TermCode } from '@/lib/domain/types';
import type { RawProfessor } from '@/lib/sources/types';
import { datasetHash } from '@/lib/utils/hash';
import { mulberry32 } from '@/lib/utils/seededRandom';
import { stableStringify } from '@/lib/utils/stableStringify';
import { EDGE_CASE_IDS } from './edgeCases';
import type { EdgeCaseRecord } from './edgeCases';
import { generateGradeRows, toGpaCsv } from './generator-grades';
import { loadSeedConfig, seedOptionsFrom, selectCourses } from './generator-priors';
import { planProfessors } from './generator-professors';
import { generateReviews } from './generator-reviews';
import { generateSections } from './generator-sections';
import type { SeedMeta, SeedOptions, SeedResult } from './generator-types';
import { DEMO_FETCHED_AT, cmp } from './generator-types';

export type { CoursePrior, SeedMeta, SeedOptions, SeedResult } from './generator-types';
export { DEMO_FETCHED_AT } from './generator-types';
export { loadSeedConfig, seedOptionsFrom, selectCourses } from './generator-priors';
export { toGpaCsv } from './generator-grades';
export type { EdgeCaseId, EdgeCaseRecord } from './edgeCases';
export { EDGE_CASE_IDS, EDGE_CASE_TITLES } from './edgeCases';

export const SEED_FILE_ORDER = ['gpa.csv', 'sections.json', 'professors.json', 'reviews.json', 'meta.json'] as const;
export type SeedFileName = (typeof SEED_FILE_ORDER)[number];
export type SeedFiles = Record<SeedFileName, string>;
export const SEED_HASH_FILE = 'seed-hash.txt';

function sortEdgeCases(records: readonly EdgeCaseRecord[]): EdgeCaseRecord[] {
  const order = new Map(EDGE_CASE_IDS.map((id, i) => [id, i] as const));
  return [...records].sort((x, y) => (order.get(x.id) ?? 99) - (order.get(y.id) ?? 99));
}

export function generateDemoSeed(opts: SeedOptions): SeedResult {
  const rng = mulberry32(opts.seed);
  const subjects = [...opts.subjects].sort();
  const courses = selectCourses(opts.priors, subjects);
  if (courses.length === 0) throw new Error('generateDemoSeed: no course priors for the requested subjects');

  const plan = planProfessors(rng, { ...opts, subjects }, courses);
  const grades = generateGradeRows(rng, plan.professors, plan.taPool, courses, plan.edgeSubject);
  const reviews = generateReviews(rng, plan.professors);
  const sections = generateSections(rng, plan.professors, plan.taPool, courses, plan.edgeSubject);

  const professors: RawProfessor[] = plan.professors
    .filter((p) => p.reviewed)
    .map((p) => ({ sourceId: p.sourceId, firstName: p.firstName, lastName: p.lastName, department: p.department, isFictional: true }))
    .sort((x, y) => cmp(x.sourceId, y.sourceId));

  const edgeCases = sortEdgeCases([...plan.edgeCases, ...grades.edgeCases, ...sections.edgeCases]);
  const meta: SeedMeta = {
    seed: opts.seed,
    currentTerm: opts.currentTerm,
    subjects,
    fetchedAt: DEMO_FETCHED_AT,
    courseCount: courses.length,
    professorCount: plan.professors.length,
    reviewedProfessorCount: professors.length,
    gradesOnlyCount: plan.professors.length - professors.length,
    gradeRowCount: grades.rows.length,
    reviewCount: reviews.length,
    sectionCount: sections.sections.length,
    openSectionCount: sections.sections.filter((s) => s.statusCode === 'open').length,
    edgeCases,
  };
  return { gradeRows: grades.rows, sections: sections.sections, professors, reviews, meta };
}

/** File contents exactly as written to data/raw/demo/demo (compact JSON via stableStringify + trailing newline). */
export function serializeSeed(result: SeedResult): SeedFiles {
  const json = (value: unknown): string => `${stableStringify(value)}\n`;
  return {
    'gpa.csv': toGpaCsv(result.gradeRows),
    'sections.json': json(result.sections),
    'professors.json': json(result.professors),
    'reviews.json': json(result.reviews),
    'meta.json': json(result.meta),
  };
}

/** sha256 over the serialized files in SEED_FILE_ORDER — the value stored in seed-hash.txt. */
export function seedHash(files: SeedFiles): string {
  return datasetHash(SEED_FILE_ORDER.map((name) => files[name]));
}

export interface SeedRuntime {
  seed: number;
  currentTerm: TermCode;
  subjects: readonly string[];
}

export interface BuiltSeed {
  options: SeedOptions;
  result: SeedResult;
  files: SeedFiles;
  hash: string;
}

/** Load the committed config from `root` (default cwd), generate, serialize and hash. */
export async function buildDemoSeed(runtime: SeedRuntime, root: string = process.cwd()): Promise<BuiltSeed> {
  const config = await loadSeedConfig(root);
  const options = seedOptionsFrom(config, runtime);
  const result = generateDemoSeed(options);
  const files = serializeSeed(result);
  return { options, result, files, hash: seedHash(files) };
}
