// scripts/ingest.ts — SPEC 6.3. `npx tsx scripts/ingest.ts --school uiuc [--subjects CS,ECE] [--out dir]`
// Sources via registry → course catalog → schedule + cross-list dedupe → reviews/professors → matching →
// sentiment/vibe tags → stats → data/processed/<school>/*.json + match-report.json + meta.json.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Meta, MetaCounts, ProfessorSummary, SchoolId, TermCode } from '@/lib/domain/types';
import { type Env, env as processEnv } from '@/lib/config/env';
import { buildSchool, processedDirName, toSchoolId } from '@/lib/config/schools';
import { getSources, type Sources } from '@/lib/sources/registry';
import type { RawReview } from '@/lib/sources/types';
import { clearMatchMemo } from '@/lib/matching';
import { readArgs, flagList, flagString } from './lib/args';
import { buildClock } from './lib/clock';
import { fail, log } from './lib/log';
import { buildCourseCatalog, computeCourseStats, ensureCoursesExist } from './ingest/catalog';
import { buildGradeRows, gradesThroughTerm } from './ingest/gradeRows';
import { dedupeCrossListed, type RawSectionWithTerm } from './ingest/sections';
import { buildDepartmentIndex, buildReviewedProfessors } from './ingest/professors';
import { annotateReviews, buildReviews } from './ingest/reviews';
import { buildMatchReport, runMatching } from './ingest/match';
import { buildSubjects, n, readJsonIfExists, summaryCounts, writeProcessed } from './ingest/write';

export interface IngestOptions {
  schoolId: SchoolId;
  env?: Env;
  /** Overrides env.SUBJECTS (live mode --subjects). */
  subjects?: string[];
  /** Overrides data/processed/<dir>. */
  outDir?: string;
  /** Bypass the registry (tests / integration harness). */
  sources?: Sources;
  now?: () => Date;
}

export interface IngestResult {
  outDir: string;
  counts: MetaCounts;
  scheduleTerm: TermCode;
  termFallback: boolean;
  gradesThroughTerm: TermCode;
  datasetHash: string;
  distinctStrings: number;
  matched: number;
  matchRate: number;
  summary: string;
  sizes: Record<string, number>;
}

/** Demo mode regression guard: matchRate below this fails the script (SPEC 6.3 step 6). */
export const MIN_DEMO_MATCH_RATE = 0.6;

const ROOT = process.cwd();

export async function runIngest(opts: IngestOptions): Promise<IngestResult> {
  const env = opts.env ?? processEnv;
  const { schoolId } = opts;
  const builtAt = buildClock(env, opts.now);
  const subjects = (opts.subjects && opts.subjects.length > 0 ? opts.subjects : env.SUBJECTS).map((s) => s.toUpperCase());
  const outDir = opts.outDir ?? path.join(ROOT, 'data', 'processed', processedDirName(schoolId, env.DATA_MODE));
  const isFictional = env.DATA_MODE === 'demo';
  clearMatchMemo();

  // 1. Sources, grades, catalog.
  const sources = opts.sources ?? getSources(schoolId, env);
  log.info(`mode=${env.DATA_MODE} sources: ${sources.grades.info.id}, ${sources.schedule.info.id}, ${sources.reviews.info.id}`);
  const grades = await sources.grades.fetch({ schoolId });
  log.info(`grades: ${n(grades.rows.length)} raw rows`);
  let courses = buildCourseCatalog(grades.rows, schoolId);
  const built = buildGradeRows(grades.rows, { schoolId, currentTerm: env.CURRENT_TERM, yearsBack: env.GRADE_YEARS_BACK });
  if (built.outOfWindow > 0 || built.badTerm > 0) log.info(`grades: dropped ${n(built.outOfWindow)} out-of-window, ${n(built.badTerm)} unparsable-term rows`);
  log.info(`grades: ${n(built.rows.length)} rows in window · ${n(built.emptyInstructor)} empty-instructor · ${n(built.blocked)} blocked strings`);
  const rows = built.rows;

  // 2. Schedule for CURRENT_TERM, then cross-list dedupe.
  const rawSections: RawSectionWithTerm[] = [];
  let scheduleTerm: TermCode = env.CURRENT_TERM;
  let seatsFetchedAt = '';
  for (const subject of subjects) {
    const res = await sources.schedule.fetchSections({ schoolId, term: env.CURRENT_TERM, subject });
    scheduleTerm = res.term;
    if (res.fetchedAt > seatsFetchedAt) seatsFetchedAt = res.fetchedAt;
    for (const raw of res.sections) rawSections.push({ raw, term: res.term, fetchedAt: res.fetchedAt });
  }
  if (seatsFetchedAt === '') seatsFetchedAt = builtAt;
  const termFallback = scheduleTerm !== env.CURRENT_TERM;
  if (termFallback) log.warn(`schedule: requested ${env.CURRENT_TERM} but source served ${scheduleTerm} (termFallback)`);
  const sections = dedupeCrossListed(rawSections, schoolId);
  log.info(`schedule: ${n(rawSections.length)} raw → ${n(sections.length)} sections after cross-list dedupe`);
  courses = ensureCoursesExist(courses, schoolId, sections.flatMap((s) => [s.courseId, ...s.crossListedCourseIds].map((courseId) => ({ courseId }))));

  // 3. Review professors and reviews.
  const departmentsFile = await readJsonIfExists<Record<string, string[]>>(path.join(ROOT, 'data', 'config', schoolId, 'departments.json'));
  const departments = buildDepartmentIndex(departmentsFile ?? {});
  const rawProfessors = await sources.reviews.fetchProfessors({ schoolId, subjects });
  const taken = new Set<string>();
  const reviewed = buildReviewedProfessors(rawProfessors, schoolId, departments, taken);
  const rawReviews: RawReview[] = [];
  for (const p of rawProfessors) rawReviews.push(...(await sources.reviews.fetchReviews(p.sourceId)));
  const catalogIds = new Set(courses.map((c) => c.id));
  const builtReviews = buildReviews(rawReviews, { schoolId, professorBySourceId: reviewed.bySourceId, catalogIds });
  if (builtReviews.orphaned > 0) log.warn(`reviews: ${n(builtReviews.orphaned)} reviews reference unknown professors (dropped)`);
  log.info(`reviews: ${n(reviewed.professors.length)} reviewed professors · ${n(builtReviews.reviews.length)} reviews (${n(builtReviews.unresolvedCourse)} unresolved course labels)`);

  // 4. Matching.
  const aliases = (await readJsonIfExists<Record<string, string>>(path.join(ROOT, 'data', 'overrides', `${schoolId}-instructor-aliases.json`))) ?? {};
  const matched = runMatching({
    schoolId, rows, sections, reviewed: reviewed.professors, reviews: builtReviews.reviews, aliases, takenSlugs: taken, isFictional,
  });
  const matchReport = buildMatchReport(matched.entries, matched.blockedStrings, sections, builtAt);
  const professors = matched.professors;

  // 5. Sentiment/vibe tags, course stats, subjects, gradesThrough.
  const reviews = annotateReviews(builtReviews.reviews);
  courses = computeCourseStats(courses, rows);
  const subjectNames = Object.fromEntries(Object.entries(departmentsFile ?? {}).map(([code, names]) => [code, names[0] ?? code]));
  const subjectRecords = buildSubjects(schoolId, subjectNames, courses, professors, sections, subjects);
  const throughTerm = gradesThroughTerm(rows) ?? env.CURRENT_TERM;

  // 6. Write.
  const school = buildSchool(schoolId, { mode: env.DATA_MODE, currentTerm: env.CURRENT_TERM, reviewSource: env.RMP_ENABLED ? 'rmp' : env.REVIEW_SOURCE });
  const summaries = await readJsonIfExists<Record<string, ProfessorSummary>>(path.join(outDir, 'summaries.json'));
  const edgeCases = isFictional ? await readEdgeCases(schoolId) : [];
  const gradesOnlyCount = professors.filter((p) => p.kind === 'grades-only').length;
  const openSections = sections.filter((s) => s.isOpen).length;
  const counts: MetaCounts = {
    professors: professors.length,
    reviewedProfessors: professors.length - gradesOnlyCount,
    gradesOnlyProfessors: gradesOnlyCount,
    gradeRows: rows.length,
    courses: courses.length,
    sections: sections.length,
    openSections,
    reviews: reviews.length,
    ...summaryCounts(summaries),
  };
  const meta: Omit<Meta, 'datasetHash'> = {
    builtAt,
    mode: env.DATA_MODE,
    seed: isFictional ? env.DEMO_SEED : null,
    currentTerm: env.CURRENT_TERM,
    scheduleTerm,
    termFallback,
    gradesThroughTerm: throughTerm,
    seatsFetchedAt,
    counts,
    sources: [
      { ...sources.grades.info, fetchedAt: grades.fetchedAt, recordCount: grades.rows.length },
      { ...sources.schedule.info, fetchedAt: seatsFetchedAt, recordCount: sections.length },
      { ...sources.reviews.info, fetchedAt: builtAt, recordCount: reviews.length },
    ],
    edgeCases,
  };
  const written = await writeProcessed(outDir, {
    'school.json': school,
    'subjects.json': subjectRecords,
    'courses.json': courses,
    'professors.json': professors,
    'grades.json': rows,
    'sections.json': sections,
    'reviews.json': reviews,
    'match-report.json': matchReport,
  }, meta);

  const cov = matchReport.coverage;
  const summary =
    `ingested ${n(rows.length)} grade rows · ${n(professors.length)} professors (${n(counts.reviewedProfessors)} reviewed, ${n(gradesOnlyCount)} grades-only)` +
    ` · ${n(reviews.length)} reviews · ${n(sections.length)} sections (${n(openSections)} open)` +
    ` · matched ${n(cov.matched)}/${n(cov.distinctStrings)} instructor strings (${(cov.matchRate * 100).toFixed(1)}%)`;
  return {
    outDir, counts, scheduleTerm, termFallback, gradesThroughTerm: throughTerm, datasetHash: written.datasetHash,
    distinctStrings: cov.distinctStrings, matched: cov.matched, matchRate: cov.matchRate, summary, sizes: written.sizes,
  };
}

async function main(): Promise<void> {
  const args = readArgs();
  const schoolId = toSchoolId(flagString(args, 'school', 'uiuc'));
  if (!schoolId) fail(`unknown --school ${flagString(args, 'school')}`);
  const subjects = flagList(args, 'subjects');
  const result = await runIngest({ schoolId, subjects: subjects.length > 0 ? subjects : undefined, outDir: flagString(args, 'out') });
  log.info(`wrote ${Object.keys(result.sizes).length} files to ${path.relative(ROOT, result.outDir) || '.'} (datasetHash ${result.datasetHash.slice(0, 12)}…)`);
  log.summary(result.summary);
  if (processEnv.DATA_MODE === 'demo' && result.matchRate < MIN_DEMO_MATCH_RATE) {
    fail(`match rate ${(result.matchRate * 100).toFixed(1)}% is below the demo guard of ${MIN_DEMO_MATCH_RATE * 100}%`);
  }
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err: unknown) => fail(err instanceof Error ? err.stack ?? err.message : String(err)));
}

/** Labels of the edge cases the seed planted (SPEC 6.5): data/raw/demo/<school>/meta.json `edgeCases` records. */
async function readEdgeCases(schoolId: SchoolId): Promise<string[]> {
  const seedMeta = await readJsonIfExists<{ edgeCases?: { id: string; title: string }[] }>(
    path.join(ROOT, 'data', 'raw', 'demo', schoolId, 'meta.json'),
  );
  if (seedMeta?.edgeCases) return seedMeta.edgeCases.map((e) => `(${e.id}) ${e.title}`);
  return (await readJsonIfExists<string[]>(path.join(ROOT, 'data', 'raw', 'demo', schoolId, 'edge-cases.json'))) ?? [];
}
