// SPEC 12.3 + MULTI_SCHOOL_DESIGN §3: JsonRepository reads the per-subject layout lazily; unknown
// school/subject/slug → null; cache hit on second read. The fixtures are copied into a temporary data dir
// laid out like data/processed/<school>/ so the test never depends on the committed dataset.
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { GradeRow, Meta, ProfessorDetail, ProfessorSummary, RankingsPayload, Section } from '@/lib/domain/types';
import {
  JsonRepository,
  RepositoryFileError,
  RepositoryNotFoundError,
  clearRepositoryCache,
  repositoryCacheStats,
} from '@/lib/repo/JsonRepository';
import rankingsFixture from '../fixtures/rankings.CS.fixture.json';
import detailFixture from '../fixtures/professors-detail.fixture.json';
import summariesFixture from '../fixtures/summaries.fixture.json';

const rankings = rankingsFixture as unknown as RankingsPayload;
const details = detailFixture as unknown as Record<string, ProfessorDetail>;
const summaries = summariesFixture as unknown as Record<string, ProfessorSummary>;

const KNOWN_SLUG = 'adaeze-okonkwo';
const KNOWN_PROFESSOR_ID = 'uiuc:p:adaeze-okonkwo';

const meta: Meta = {
  builtAt: '2026-09-04T00:00:00Z',
  mode: 'live',
  seed: null,
  datasetHash: 'fixture',
  currentTerm: '2026-fa',
  scheduleTerm: '2026-fa',
  termFallback: false,
  gradesThroughTerm: '2026-sp',
  seatsFetchedAt: '2026-09-03T14:12:00Z',
  counts: {
    professors: 4, reviewedProfessors: 4, gradesOnlyProfessors: 0, gradeRows: 0, courses: rankings.courses.length,
    sections: 0, openSections: 0, reviews: 0, summariesClaude: 0, summariesExtractive: 0,
  },
  sources: [],
  edgeCases: [],
  subjects: ['CS'],
};

const gradeRow: GradeRow = {
  id: 'row-1', schoolId: 'uiuc', courseId: 'uiuc:CS:225', term: '2025-fa', year: 2025, schedType: 'LEC', isHeadline: true,
  instructorRaw: 'Okonkwo, Adaeze', professorId: KNOWN_PROFESSOR_ID, matchMethod: 'exact', matchScore: 1,
  buckets: { aPlus: 0, a: 20, aMinus: 0, bPlus: 0, b: 0, bMinus: 0, cPlus: 0, c: 0, cMinus: 0, dPlus: 0, d: 0, dMinus: 0, f: 0, w: 0 },
  graded: 20, withdrawn: 0, students: 20, gpa: 4, suppressed: false,
};

let dataDir: string;
let repo: JsonRepository;

async function writeJson(rel: string, value: unknown): Promise<void> {
  const abs = path.join(dataDir, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, JSON.stringify(value), 'utf8');
}

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'profpeek-repo-'));
  const sections: Section[] = Object.values(details).flatMap((d) => d.sections);
  // Every fixture professor teaches CS; one of them also claims ECE, whose detail file deliberately does not exist.
  const professors = Object.values(details).map((d, i) => ({ ...d.professor, subjects: i === 0 ? ['ECE', 'CS'] : d.professor.subjects }));
  await Promise.all([
    writeJson('uiuc/school.json', rankings.school),
    writeJson('uiuc/meta.json', meta),
    writeJson('uiuc/subjects.json', [rankings.subject]),
    writeJson('uiuc/rankings/CS.json', rankings),
    writeJson('uiuc/professors-detail/CS.json', details),
    writeJson('uiuc/grades/CS.json', [gradeRow]),
    writeJson('uiuc/summaries.json', summaries),
    writeJson('uiuc/sections.json', sections),
    writeJson('uiuc/professors.json', professors),
    writeFile(path.join(dataDir, 'uiuc', 'match-report.json'), '{ not json', 'utf8'),
  ]);
  repo = new JsonRepository({ dataDir });
});

afterAll(async () => {
  clearRepositoryCache();
  await rm(dataDir, { recursive: true, force: true });
});

beforeEach(() => clearRepositoryCache());

describe('JsonRepository', () => {
  it('resolves one directory per school id', () => {
    expect(repo.schoolDir('uiuc')).toBe(path.join(dataDir, 'uiuc'));
    expect(repo.schoolDir('purdue')).toBe(path.join(dataDir, 'purdue'));
    expect(repo.schoolIds).toContain('uiuc');
  });

  it('reads the school, schools list (enabled ids with data only), subjects and meta from fixtures', async () => {
    const school = await repo.getSchool('uiuc');
    expect(school?.id).toBe('uiuc');
    expect(school?.name).toBe(rankings.school.name);
    expect((await repo.getSchools()).map((s) => s.id)).toEqual(['uiuc']); // purdue has no school.json in this data dir
    expect(await new JsonRepository({ dataDir, schoolIds: ['purdue'] }).getSchools()).toEqual([]);
    expect((await repo.getSubjects('uiuc')).map((s) => s.code)).toEqual([rankings.subject.code]);
    expect((await repo.getMeta('uiuc')).currentTerm).toBe('2026-fa');
  });

  it('reads the rankings payload and grade rows for a subject (case-insensitive)', async () => {
    const payload = await repo.getRankingsPayload('uiuc', 'cs');
    expect(payload?.subject.code).toBe('CS');
    expect(payload?.professors).toHaveLength(rankings.professors.length);
    expect((await repo.getGradeRows('uiuc', 'cs')).map((r) => r.id)).toEqual(['row-1']);
    expect(await repo.getGradeRows('uiuc', 'ECE')).toEqual([]);
    expect(await repo.getGradeRows('uiuc', '../meta')).toEqual([]);
  });

  it('reads a professor detail by slug through professors.json → professors-detail/<SUBJECT>.json, and a summary by id', async () => {
    const detail = await repo.getProfessorBySlug('uiuc', KNOWN_SLUG);
    expect(detail?.professor.id).toBe(KNOWN_PROFESSOR_ID);
    expect((await repo.getProfessorBySlug('uiuc', ` ${KNOWN_SLUG.toUpperCase()} `))?.professor.id).toBe(KNOWN_PROFESSOR_ID);
    // The first fixture professor lists ECE first (no file) and CS second: the lookup falls through to CS.
    const first = Object.values(details)[0].professor;
    expect((await repo.getProfessorBySlug('uiuc', first.slug))?.professor.id).toBe(first.id);
    const summary = await repo.getSummary(KNOWN_PROFESSOR_ID);
    expect(summary).not.toBeNull();
    expect((await repo.getProfessors('uiuc')).map((p) => p.slug)).toContain(KNOWN_SLUG);
  });

  it('filters sections by subject including cross-listed course ids', async () => {
    const all: Section[] = Object.values(details).flatMap((d) => d.sections);
    const cs = await repo.getSections('uiuc', 'CS');
    expect(cs.length).toBeGreaterThan(0);
    expect(cs.length).toBeLessThanOrEqual(all.length);
    for (const s of cs) {
      const ids = [s.courseId, ...s.crossListedCourseIds];
      expect(ids.some((id) => id.split(':')[1] === 'CS')).toBe(true);
    }
    expect(await repo.getSections('uiuc', 'ZZZZ')).toEqual([]);
  });

  it('returns null / empty for unknown school, subject, slug and professor id', async () => {
    expect(await repo.getSchool('mit')).toBeNull();
    expect(await repo.getRankingsPayload('uiuc', 'ZZZ')).toBeNull();
    expect(await repo.getRankingsPayload('uiuc', 'not a subject')).toBeNull();
    expect(await repo.getProfessorBySlug('uiuc', 'nobody-here')).toBeNull();
    expect(await repo.getProfessorBySlug('uiuc', 'Bad Slug!')).toBeNull();
    // keys that pass the slug regex but live on Object.prototype must not resolve to a function
    for (const key of ['constructor', 'toString', 'hasownproperty', 'valueof']) expect(await repo.getProfessorBySlug('uiuc', key)).toBeNull();
    expect(await repo.getSummary('uiuc:p:constructor')).toBeNull();
    expect(await repo.getSummary('constructor')).toBeNull();
    // traversal and oversized identifiers never reach the filesystem
    expect(await repo.getProfessorBySlug('uiuc', '../../etc/passwd')).toBeNull();
    expect(await repo.getProfessorBySlug('uiuc', 'a'.repeat(10_000))).toBeNull();
    expect(await repo.getRankingsPayload('uiuc', '../meta')).toBeNull();
    expect(await repo.getRankingsPayload('uiuc', '..')).toBeNull();
    expect(await repo.getSummary('uiuc:p:nobody-here')).toBeNull();
    expect(await repo.getSummary('mit:p:nobody')).toBeNull();
    expect(await repo.getCourses('uiuc', 'CS')).toEqual([]); // courses.json absent → []
    const empty = new JsonRepository({ dataDir: path.join(dataDir, 'nowhere') });
    expect(await empty.getSchools()).toEqual([]);
    expect(await empty.getSubjects('uiuc')).toEqual([]);
    expect(await empty.getProfessorBySlug('uiuc', KNOWN_SLUG)).toBeNull();
    await expect(empty.getMeta('uiuc')).rejects.toBeInstanceOf(RepositoryNotFoundError);
  });

  it('surfaces unreadable JSON as RepositoryFileError instead of swallowing it', async () => {
    await expect(repo.getMatchReport('uiuc')).rejects.toBeInstanceOf(RepositoryFileError);
    expect(repositoryCacheStats().entries).toBe(0); // failed reads are not cached
  });

  it('hits the cache on the second read', async () => {
    const before = repositoryCacheStats();
    const first = await repo.getRankingsPayload('uiuc', 'CS');
    const afterFirst = repositoryCacheStats();
    expect(afterFirst.fileReads).toBe(before.fileReads + 1);
    expect(afterFirst.entries).toBe(before.entries + 1);
    const second = await repo.getRankingsPayload('uiuc', 'CS');
    const afterSecond = repositoryCacheStats();
    expect(afterSecond.fileReads).toBe(afterFirst.fileReads);
    expect(afterSecond.entries).toBe(afterFirst.entries);
    expect(second).toBe(first); // same parsed object, not a re-parse
    // misses are not cached so data can appear after a pipeline run
    await repo.getRankingsPayload('uiuc', 'ECE');
    expect(repositoryCacheStats().entries).toBe(afterSecond.entries);
    // a second slug lookup re-reads neither professors.json nor the detail file
    await repo.getProfessorBySlug('uiuc', KNOWN_SLUG);
    const reads = repositoryCacheStats().fileReads;
    await repo.getProfessorBySlug('uiuc', 'halvard-sorensen');
    expect(repositoryCacheStats().fileReads).toBe(reads);
  });
});
