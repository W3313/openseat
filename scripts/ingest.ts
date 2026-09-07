// scripts/ingest.ts — SPEC 6.3 + MULTI_SCHOOL_DESIGN §2/§3. `npx tsx scripts/ingest.ts --school <id> [--subjects CS,ECE] [--out dir] [--refresh]`
// Sources resolved per school from the registry → course catalog → schedule + cross-list dedupe →
// reviews/professors (NullReviewSource for real schools) → matching → sentiment/vibe tags → stats →
// data/processed/<school>/{school,subjects,courses,professors,sections,reviews,match-report,meta}.json
// + grades/<SUBJECT>.json (+ summaries.json = {} when absent).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Meta, MetaCounts, ProfessorSummary, SchoolId, TermCode } from '@/lib/domain/types';
import { type Env, env as processEnv } from '@/lib/config/env';
import { buildSchool, getSchoolConfig, schoolConfigDir, toRegisteredSchoolId } from '@/lib/config/schools';
import { getSources, type Sources } from '@/lib/sources/registry';
import type { RawReview } from '@/lib/sources/types';
import { clearMatchMemo } from '@/lib/matching';
import { readArgs, flagBool, flagList, flagString } from './lib/args';
import { buildClock } from './lib/clock';
import { fail, log } from './lib/log';
import { buildCourseCatalog, computeCourseStats, ensureCoursesExist } from './ingest/catalog';
import { buildGradeRows, gradesThroughTerm } from './ingest/gradeRows';
import { dedupeCrossListed, type RawSectionWithTerm } from './ingest/sections';
import { buildDepartmentIndex, buildReviewedProfessors } from './ingest/professors';
import { annotateReviews, buildReviews } from './ingest/reviews';
import { buildMatchReport, runMatching } from './ingest/match';
import { coverageLine } from '@/components/about/CoverageStats';
import { buildSubjects, n, readJsonIfExists, serialize, splitGradesBySubject, summaryCounts, writeJson, writeProcessed } from './ingest/write';

export interface IngestOptions {
  schoolId: SchoolId;
  env?: Env;
  /** Overrides SchoolConfig.subjects (any registry id; 'all' is spelled as an empty list here). */
  subjects?: string[];
  /** Overrides data/processed/<school>. */
  outDir?: string;
  /** Bypass the registry (tests / integration harness). */
  sources?: Sources;
  /** Schedule adapters: bypass their raw cache. */
  refresh?: boolean;
  now?: () => Date;
}

export interface IngestResult {
  outDir: string;
  counts: MetaCounts;
  subjects: string[];
  scheduleTerm: TermCode;
  termFallback: boolean;
  gradesThroughTerm: TermCode;
  datasetHash: string;
  distinctStrings: number;
  matched: number;
  /** matched / distinct strings with reviews; schedule linkage without (null when the school has no schedule). */
  matchRate: number | null;
  summary: string;
  sizes: Record<string, number>;
}

/** Optional per-adapter extras on the GradeSource.fetch result (MULTI_SCHOOL_DESIGN §4; typed here until sources/types.ts carries them). */
interface GradeFetchExtras {
  excludedGradeCodes?: Record<string, number>;
  droppedRows?: number;
}

const ROOT = process.cwd();

export async function runIngest(opts: IngestOptions): Promise<IngestResult> {
  const env = opts.env ?? processEnv;
  const config = getSchoolConfig(opts.schoolId);
  const schoolId = config.id;
  const builtAt = buildClock(opts.now);
  const outDir = opts.outDir ?? path.join(ROOT, 'data', 'processed', schoolId);
  const requested: string[] | 'all' =
    opts.subjects && opts.subjects.length > 0 ? opts.subjects.map((s) => s.trim().toUpperCase()) : config.subjects;
  const allowlist = requested === 'all' ? null : new Set(requested);
  clearMatchMemo();

  // 1. Sources, grades (filtered to the subject allowlist), catalog.
  const sources = opts.sources ?? getSources(schoolId, env, { refresh: opts.refresh, log });
  log.info(`school=${schoolId} mode=${config.mode} sources: ${sources.grades.info.id}, ${sources.schedule.info.id}, ${sources.reviews.info.id}`);
  const grades = await sources.grades.fetch({ schoolId });
  const extras = grades as typeof grades & GradeFetchExtras;
  const rawRows = allowlist ? grades.rows.filter((r) => allowlist.has(r.subject.trim().toUpperCase())) : grades.rows;
  const subjects = allowlist ? [...allowlist].sort() : [...new Set(rawRows.map((r) => r.subject.trim().toUpperCase()).filter(Boolean))].sort();
  log.info(`grades: ${n(grades.rows.length)} raw rows · ${n(rawRows.length)} in ${subjects.length} subject(s)${allowlist ? ' (allowlist)' : ''}`);
  let courses = buildCourseCatalog(rawRows, schoolId);
  const built = buildGradeRows(rawRows, { schoolId, currentTerm: config.currentTerm, yearsBack: env.GRADE_YEARS_BACK });
  if (built.outOfWindow > 0 || built.badTerm > 0) log.info(`grades: dropped ${n(built.outOfWindow)} out-of-window, ${n(built.badTerm)} unparsable-term rows`);
  log.info(`grades: ${n(built.rows.length)} rows in window · ${n(built.emptyInstructor)} empty-instructor · ${n(built.blocked)} blocked strings`);
  const rows = built.rows;

  // 2. Schedule for the school's current term, then cross-list dedupe.
  const rawSections: RawSectionWithTerm[] = [];
  let scheduleTerm: TermCode = config.currentTerm;
  let seatsFetchedAt = '';
  for (const subject of subjects) {
    const res = await sources.schedule.fetchSections({ schoolId, term: config.currentTerm, subject });
    scheduleTerm = res.term;
    if (res.fetchedAt > seatsFetchedAt) seatsFetchedAt = res.fetchedAt;
    for (const raw of res.sections) rawSections.push({ raw, term: res.term, fetchedAt: res.fetchedAt });
  }
  if (seatsFetchedAt === '') seatsFetchedAt = builtAt;
  const termFallback = scheduleTerm !== config.currentTerm;
  if (termFallback) log.warn(`schedule: requested ${config.currentTerm} but source served ${scheduleTerm} (termFallback)`);
  const sections = dedupeCrossListed(rawSections, schoolId);
  log.info(`schedule: ${n(rawSections.length)} raw → ${n(sections.length)} sections after cross-list dedupe`);
  courses = ensureCoursesExist(courses, schoolId, sections.flatMap((s) => [s.courseId, ...s.crossListedCourseIds].map((courseId) => ({ courseId }))));

  // 3. Review professors and reviews (empty for real schools).
  const departmentsFile = await readJsonIfExists<Record<string, string[]>>(path.join(ROOT, schoolConfigDir(config), 'departments.json'));
  const departments = buildDepartmentIndex(departmentsFile ?? {});
  const rawProfessors = await sources.reviews.fetchProfessors({ schoolId, subjects });
  // Every registered school is real: no source may hand ingest a fictional person (the demo generator is gone).
  if (rawProfessors.some((p) => p.isFictional)) fail(`${sources.reviews.info.id} returned fictional professors for real school ${schoolId}`);
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
    schoolId, rows, sections, reviewed: reviewed.professors, reviews: builtReviews.reviews, aliases, takenSlugs: taken, isFictional: false,
  });
  const matchReport = buildMatchReport(matched.entries, matched.blockedStrings, sections, builtAt, config.sources.reviews !== null);
  const professors = matched.professors;
  if (professors.some((p) => p.isFictional)) fail(`ingest produced a fictional professor for real school ${schoolId}`);

  // 5. Sentiment/vibe tags, course stats, subjects, gradesThrough.
  const reviews = annotateReviews(builtReviews.reviews);
  courses = computeCourseStats(courses, rows);
  const subjectNames = Object.fromEntries(Object.entries(departmentsFile ?? {}).map(([code, names]) => [code, names[0] ?? code]));
  const subjectRecords = buildSubjects(schoolId, subjectNames, courses, professors, sections, subjects, { restrictToRequested: allowlist !== null });
  const subjectCodes = subjectRecords.map((s) => s.code);
  const throughTerm = gradesThroughTerm(rows) ?? config.currentTerm;

  // 6. Write.
  const school = buildSchool(config);
  const summaries = await readJsonIfExists<Record<string, ProfessorSummary>>(path.join(outDir, 'summaries.json'));
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
  const sourceMeta = [
    { ...sources.grades.info, fetchedAt: grades.fetchedAt, recordCount: grades.rows.length },
    { ...sources.schedule.info, fetchedAt: seatsFetchedAt, recordCount: sections.length },
    { ...sources.reviews.info, fetchedAt: builtAt, recordCount: reviews.length },
  ].filter((s) => s.id !== 'none');
  const meta: Omit<Meta, 'datasetHash'> = {
    builtAt,
    mode: config.mode,
    seed: null,
    currentTerm: config.currentTerm,
    scheduleTerm,
    termFallback,
    gradesThroughTerm: throughTerm,
    seatsFetchedAt,
    counts,
    sources: sourceMeta,
    edgeCases: [],
    subjects: subjectCodes,
    excludedGradeCodes: extras.excludedGradeCodes ?? {},
    droppedRows: extras.droppedRows ?? 0,
  };
  const written = await writeProcessed(outDir, {
    'school.json': school,
    'subjects.json': subjectRecords,
    'courses.json': courses,
    'professors.json': professors,
    'sections.json': sections,
    'reviews.json': reviews,
    'match-report.json': matchReport,
  }, splitGradesBySubject(rows, subjectCodes), meta);
  if (summaries === undefined) await writeJson(outDir, 'summaries.json', serialize({})); // real schools: empty map (§3)

  const cov = matchReport.coverage;
  const summary =
    `ingested ${n(rows.length)} grade rows in ${subjectCodes.length} subjects · ${n(professors.length)} professors (${n(counts.reviewedProfessors)} reviewed, ${n(gradesOnlyCount)} grades-only)` +
    ` · ${n(reviews.length)} reviews · ${n(sections.length)} sections (${n(openSections)} open)` +
    ` · ${coverageLine(cov, config.sources.reviews !== null)}`;
  return {
    outDir, counts, subjects: subjectCodes, scheduleTerm, termFallback, gradesThroughTerm: throughTerm, datasetHash: written.datasetHash,
    distinctStrings: cov.distinctStrings, matched: cov.matched, matchRate: cov.matchRate, summary, sizes: written.sizes,
  };
}

async function main(): Promise<void> {
  const args = readArgs();
  const requested = flagString(args, 'school');
  if (!requested) fail('usage: tsx scripts/ingest.ts --school <id> [--subjects CS,ECE] [--out dir] [--refresh]');
  const schoolId = toRegisteredSchoolId(requested);
  if (!schoolId) fail(`unknown --school ${requested}`);
  const subjects = flagList(args, 'subjects');
  const result = await runIngest({ schoolId, subjects: subjects.length > 0 ? subjects : undefined, outDir: flagString(args, 'out'), refresh: flagBool(args, 'refresh') });
  const bytes = Object.values(result.sizes).reduce((a, b) => a + b, 0);
  log.info(`wrote ${Object.keys(result.sizes).length} files (${(bytes / 1024 / 1024).toFixed(2)} MB) to ${path.relative(ROOT, result.outDir) || '.'} (datasetHash ${result.datasetHash.slice(0, 12)}…)`);
  log.summary(result.summary);
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err: unknown) => fail(err instanceof Error ? err.stack ?? err.message : String(err)));
}
