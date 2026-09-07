// SPEC 4 / 12.3: every GET handler called directly with a Request — no server. Grades-only routes run against
// the committed real dataset (data/processed/uiuc); the review-dependent routes (professor detail with reviews,
// summary) run against the synthetic fixtures in tests/fixtures copied into a temporary data dir, because no
// real school has reviews (review features are dormant until first-party reviews ship). Asserts status codes,
// error shape, cache headers and the summary route's cached / extractive / too_few_reviews branches.
// applyRankingsQuery (scoring module) is replaced by a small deterministic stand-in so this file only
// exercises the route wiring.
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MatchReport, Meta, ProfessorDetail, RankingsPayload, RankingsQuery, RankingsResponse } from '@/lib/domain/types';
import type { HealthResponse, SchoolsResponse, SectionsResponse, SubjectsResponse, SummaryResponse } from '@/lib/api/types';
import type { ApiErrorBody } from '@/lib/api/respond';
import { API_CACHE_CONTROL, API_ERROR_CACHE_CONTROL } from '@/lib/api/respond';
import { setApiErrorLogger } from '@/lib/api/handlers';
import { resetRateLimits, setRateLimitEnabled } from '@/lib/api/rateLimit';
import { buildSummaryResponse } from '@/lib/api/summary';
import { getRepository, setRepository, type Repository } from '@/lib/repo';
import { JsonRepository, clearRepositoryCache } from '@/lib/repo/JsonRepository';
import { GET as health } from '@/app/api/health/route';
import { GET as schools } from '@/app/api/schools/route';
import { GET as subjects } from '@/app/api/schools/[school]/subjects/route';
import { GET as rankings } from '@/app/api/schools/[school]/rankings/route';
import { GET as course } from '@/app/api/schools/[school]/courses/[subject]/[number]/route';
import { GET as professor } from '@/app/api/schools/[school]/professors/[slug]/route';
import { GET as summary } from '@/app/api/schools/[school]/professors/[slug]/summary/route';
import { GET as sections } from '@/app/api/schools/[school]/sections/route';
import { GET as matchReport } from '@/app/api/schools/[school]/match-report/route';
import rankingsFixture from '../fixtures/rankings.CS.fixture.json';
import detailFixture from '../fixtures/professors-detail.fixture.json';

vi.mock('@/lib/scoring/rank', () => ({
  applyRankingsQuery: (payload: RankingsPayload, query: RankingsQuery): RankingsResponse => {
    const { professors, ...rest } = payload;
    const inCourse = query.course
      ? professors.filter((p) => p.courses.some((c) => c.number === query.course))
      : professors;
    const open = query.openOnly ? inCourse.filter((p) => p.openSections.length > 0) : inCourse;
    const ranked = open.filter((p) => p.scores.reviewCount >= 3).map((p, i) => ({ ...p, rank: i + 1 }));
    const lowData = open.filter((p) => p.scores.reviewCount < 3);
    return {
      ...rest, query, ranked, lowData,
      totals: { ranked: ranked.length, lowData: lowData.length, openSections: 0, reviews: 0 },
    };
  },
}));

const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) });
const req = (path: string) => new Request(`http://localhost${path}`);
const json = async <T>(res: Response) => (await res.json()) as T;
const errorOf = async (res: Response) => (await json<ApiErrorBody>(res)).error;

/** The real, committed, grades-only school every non-review route is exercised against. */
const REAL = 'uiuc';

// ── review fixtures (synthetic professors; the fixture school id is also 'uiuc') ─────────────────────
const fixtureRankings = rankingsFixture as unknown as RankingsPayload;
const fixtureDetails = detailFixture as unknown as Record<string, ProfessorDetail>;
const known = Object.values(fixtureDetails).find((d) => d.professor.kind === 'reviewed' && d.scores.reviewCount >= 3 && d.reviews.length >= 3);
const low = Object.values(fixtureDetails).find((d) => d.scores.reviewCount > 0 && d.scores.reviewCount < 3);
if (!known || !low) throw new Error('fixtures lack a reviewed (>= 3 reviews) or a low-data (< 3 reviews) professor');
const KNOWN_SLUG = known.professor.slug;
const KNOWN_ID = known.professor.id;
const LOW_DATA_SLUG = low.professor.slug;

let fixtureDir: string;
let fixtureRepo: JsonRepository;

beforeAll(async () => {
  fixtureDir = await mkdtemp(path.join(os.tmpdir(), 'profpeek-api-'));
  const write = async (rel: string, value: unknown) => {
    const abs = path.join(fixtureDir, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, JSON.stringify(value), 'utf8');
  };
  const meta: Meta = {
    builtAt: '2026-09-04T00:00:00Z', mode: 'live', seed: null, datasetHash: 'f'.repeat(64),
    currentTerm: '2026-fa', scheduleTerm: '2026-fa', termFallback: false, gradesThroughTerm: '2026-sp', seatsFetchedAt: '2026-09-03T14:12:00Z',
    counts: {
      professors: 4, reviewedProfessors: 3, gradesOnlyProfessors: 1, gradeRows: 0, courses: fixtureRankings.courses.length,
      sections: 0, openSections: 0, reviews: 0, summariesClaude: 0, summariesExtractive: 0,
    },
    sources: [], edgeCases: [], subjects: ['CS'],
  };
  await Promise.all([
    write('uiuc/school.json', fixtureRankings.school),
    write('uiuc/meta.json', meta),
    write('uiuc/subjects.json', [fixtureRankings.subject]),
    write('uiuc/rankings/CS.json', fixtureRankings),
    write('uiuc/professors-detail/CS.json', fixtureDetails),
    write('uiuc/summaries.json', {}),
    write('uiuc/sections.json', Object.values(fixtureDetails).flatMap((d) => d.sections)),
    write('uiuc/professors.json', Object.values(fixtureDetails).map((d) => d.professor)),
  ]);
  fixtureRepo = new JsonRepository({ dataDir: fixtureDir, schoolIds: ['uiuc'] });
});

afterAll(async () => {
  clearRepositoryCache();
  await rm(fixtureDir, { recursive: true, force: true });
});

beforeAll(() => {
  setApiErrorLogger(() => {});
  setRateLimitEnabled(false); // the limiter has its own test file; every route test runs from one 'unknown' IP
});
afterAll(() => {
  setApiErrorLogger(null);
  setRateLimitEnabled(true);
  resetRateLimits();
});
afterEach(() => setRepository(null));

describe('headers and error shape', () => {
  it('every success sets the shared Cache-Control and JSON content type', async () => {
    const res = await health(req('/api/health'));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(API_CACHE_CONTROL);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('404 for an unknown school uses { error: { code, message } }, is briefly cacheable and never echoes the raw segment', async () => {
    const res = await subjects(req('/api/schools/mit/subjects'), ctx({ school: 'mit' }));
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe(API_ERROR_CACHE_CONTROL);
    const error = await errorOf(res);
    expect(error.code).toBe('not_found');
    expect(error.message).toBe('Unknown school');
  });

  it('404 for the removed schools (demo, utd, ucsb)', async () => {
    for (const school of ['demo', 'utd', 'ucsb']) {
      const res = await subjects(req('/x'), ctx({ school }));
      expect(res.status, school).toBe(404);
      expect((await errorOf(res)).message).toBe('Unknown school');
    }
  });

  it('500 when the repository throws: generic message, no-store, no stack', async () => {
    const boom: Partial<Repository> = { getMeta: async () => { throw new Error('disk on fire /secret/path'); } };
    setRepository(boom as Repository);
    const res = await health(req('/api/health'));
    expect(res.status).toBe(500);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const error = await errorOf(res);
    expect(error.code).toBe('internal');
    expect(error.message).not.toContain('secret');
  });
});

describe('GET /api/health and /api/schools', () => {
  it('health mirrors meta.json of the default (first enabled, real) school', async () => {
    const body = await json<HealthResponse>(await health(req('/api/health')));
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('live');
    expect(body.currentTerm).toMatch(/^\d{4}-(wi|sp|su|fa)$/);
    expect(body.datasetHash).toHaveLength(64);
    expect(body.aiSummaries).toEqual({ claude: body.counts.summariesClaude, openaiCompatible: body.counts.summariesOpenAiCompatible ?? 0, extractive: body.counts.summariesExtractive });
  });

  it('schools lists every enabled school with a dataset — the three real schools, nothing else', async () => {
    const body = await json<SchoolsResponse>(await schools(req('/api/schools')));
    expect(body.schools.map((s) => s.id).sort()).toEqual(['purdue', 'uh', 'uiuc']);
  });
});

describe('GET /api/schools/[school]/subjects', () => {
  it('returns only subjects with ≥ 1 professor and accepts an upper-cased school segment', async () => {
    const body = await json<SubjectsResponse>(await subjects(req('/x'), ctx({ school: REAL.toUpperCase() })));
    expect(body.subjects.length).toBeGreaterThan(0);
    expect(body.subjects.every((s) => s.professorCount >= 1)).toBe(true);
    expect(body.subjects.map((s) => s.code)).toContain('CS');
  });
});

describe('GET /api/schools/[school]/rankings', () => {
  it('400 on a missing or malformed subject', async () => {
    const missing = await rankings(req(`/api/schools/${REAL}/rankings`), ctx({ school: REAL }));
    expect(missing.status).toBe(400);
    expect((await errorOf(missing)).code).toBe('bad_query');
    const bad = await rankings(req(`/api/schools/${REAL}/rankings?subject=CS&sort=nope`), ctx({ school: REAL }));
    expect(bad.status).toBe(400);
  });

  it('404 on an unknown subject; 404 on unknown school beats a valid query', async () => {
    expect((await rankings(req('/x?subject=ZZZ'), ctx({ school: REAL }))).status).toBe(404);
    expect((await rankings(req('/x?subject=CS'), ctx({ school: 'nope' }))).status).toBe(404);
  });

  it('applies the query server-side and echoes it (grades-only: every professor has 0 reviews)', async () => {
    const res = await rankings(req('/x?subject=cs&sort=gpa&open=0&course=225'), ctx({ school: REAL }));
    expect(res.status).toBe(200);
    const body = await json<RankingsResponse>(res);
    expect(body.query).toEqual({ sort: 'gpa', openOnly: false, course: '225' });
    expect(body.subject.code).toBe('CS');
    expect(body.scope).toEqual({ kind: 'subject' });
    expect(body.school.reviewsAvailable).toBe(false);
    expect(body.ranked.every((p) => p.rank !== null && p.scores.reviewCount >= 3)).toBe(true);
    expect(body.lowData.every((p) => p.scores.reviewCount < 3)).toBe(true);
    expect(body.ranked.length + body.lowData.length).toBeGreaterThan(0);
    expect(body).not.toHaveProperty('professors');
  });
});

describe('GET /api/schools/[school]/courses/[subject]/[number]', () => {
  it('returns a course-scoped RankingsResponse', async () => {
    const res = await course(req('/x?open=0'), ctx({ school: REAL, subject: 'cs', number: '225' }));
    expect(res.status).toBe(200);
    const body = await json<RankingsResponse>(res);
    expect(body.scope).toEqual({ kind: 'course', courseId: `${REAL}:CS:225` });
    expect(body.query).toEqual({ sort: 'rating', openOnly: false, course: '225' });
    expect(body.ranked.length + body.lowData.length).toBeGreaterThan(0);
  });

  it('404 for unknown / malformed course segments, 400 for a bad query', async () => {
    expect((await course(req('/x'), ctx({ school: REAL, subject: 'CS', number: '999' }))).status).toBe(404);
    expect((await course(req('/x'), ctx({ school: REAL, subject: 'C', number: '225' }))).status).toBe(404);
    expect((await course(req('/x'), ctx({ school: REAL, subject: 'CS', number: '22' }))).status).toBe(404);
    expect((await course(req('/x?open=2'), ctx({ school: REAL, subject: 'CS', number: '225' }))).status).toBe(400);
  });
});

describe('GET /api/schools/[school]/professors/[slug]', () => {
  it('returns the ProfessorDetail for a known real (grades-only) slug', async () => {
    const [first] = await getRepository().getProfessors(REAL);
    const res = await professor(req('/x'), ctx({ school: REAL, slug: first.slug }));
    expect(res.status).toBe(200);
    const body = await json<ProfessorDetail>(res);
    expect(body.professor.slug).toBe(first.slug);
    expect(body.professor.isFictional).toBe(false);
    expect(body.reviews).toEqual([]);
    expect(body.scores.reviewCount).toBe(0);
  });

  it('returns the ProfessorDetail with reviews for a reviewed fixture professor', async () => {
    setRepository(fixtureRepo);
    const res = await professor(req('/x'), ctx({ school: 'uiuc', slug: KNOWN_SLUG }));
    expect(res.status).toBe(200);
    const body = await json<ProfessorDetail>(res);
    expect(body.professor.slug).toBe(KNOWN_SLUG);
    expect(Array.isArray(body.reviews)).toBe(true);
    expect(body.scores.reviewCount).toBeGreaterThanOrEqual(3);
  });

  it('404 for unknown and malformed slugs', async () => {
    expect((await professor(req('/x'), ctx({ school: REAL, slug: 'nobody-here' }))).status).toBe(404);
    expect((await professor(req('/x'), ctx({ school: REAL, slug: 'bad slug!' }))).status).toBe(404);
  });
});

describe('GET /api/schools/[school]/professors/[slug]/summary', () => {
  it('too_few_reviews for every real professor (no school has reviews yet)', async () => {
    const [first] = await getRepository().getProfessors(REAL);
    const body = await json<SummaryResponse>(await summary(req('/x'), ctx({ school: REAL, slug: first.slug })));
    expect(body).toEqual({ summary: null, cached: false, reason: 'too_few_reviews' });
  });

  it('returns a summary for a reviewed fixture professor and says whether it was cached', async () => {
    setRepository(fixtureRepo);
    const res = await summary(req('/x'), ctx({ school: 'uiuc', slug: KNOWN_SLUG }));
    expect(res.status).toBe(200);
    const body = await json<SummaryResponse>(res);
    expect(body.summary).not.toBeNull();
    expect(typeof body.cached).toBe('boolean');
    expect(body.reason).toBeUndefined();
    expect(body.summary?.professorId).toBe(KNOWN_ID);
    expect(['claude', 'openai-compatible', 'extractive']).toContain(body.summary?.source);
  });

  it('too_few_reviews when reviewCount < 3', async () => {
    setRepository(fixtureRepo);
    const body = await json<SummaryResponse>(await summary(req('/x'), ctx({ school: 'uiuc', slug: LOW_DATA_SLUG })));
    expect(body).toEqual({ summary: null, cached: false, reason: 'too_few_reviews' });
  });

  it('computes the extractive summary at request time when nothing is cached', async () => {
    const detail = fixtureDetails[KNOWN_SLUG];
    const uncached: ProfessorDetail = {
      ...detail, summary: null,
      professor: { ...detail.professor, id: 'uiuc:p:not-in-any-cache' },
      reviews: detail.reviews.map((r) => ({ ...r, professorId: 'uiuc:p:not-in-any-cache' })),
    };
    const body = await buildSummaryResponse(uncached, { getSummary: async () => null });
    expect(body.cached).toBe(false);
    expect(body.summary?.source).toBe('extractive');
    expect(body.summary?.model).not.toBe('claude-opus-5');
    expect(body.summary?.reviewCount).toBe(detail.scores.reviewCount);
    expect(body.summary?.confidence).toBe(detail.scores.confidence);
  });

  it('returns a valid cached entry as-is with cached: true', async () => {
    const detail = fixtureDetails[KNOWN_SLUG];
    const first = await buildSummaryResponse({ ...detail, summary: null }, { getSummary: async () => null });
    // Whatever the first call produced has a hash valid for this input → a second call must treat it as cached.
    const second = await buildSummaryResponse({ ...detail, summary: first.summary }, { getSummary: async () => null });
    expect(second).toEqual({ summary: first.summary, cached: true });
  });

  it('404 for an unknown professor', async () => {
    expect((await summary(req('/x'), ctx({ school: REAL, slug: 'nobody-here' }))).status).toBe(404);
  });
});

describe('GET /api/schools/[school]/sections', () => {
  it('400 without subject, 404 for an unknown subject', async () => {
    expect((await sections(req('/x'), ctx({ school: REAL }))).status).toBe(400);
    expect((await sections(req('/x?subject=ZZZ'), ctx({ school: REAL }))).status).toBe(404);
  });

  it('returns term, seatsFetchedAt and the subject\'s sections', async () => {
    const body = await json<SectionsResponse>(await sections(req('/x?subject=cs'), ctx({ school: REAL })));
    expect(body.term).toMatch(/^\d{4}-(wi|sp|su|fa)$/);
    expect(body.seatsFetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.sections.length).toBeGreaterThan(0);
    expect(body.sections.every((s) => s.courseId.startsWith(`${REAL}:CS:`) || s.crossListedCourseIds.some((c) => c.startsWith(`${REAL}:CS:`)))).toBe(true);
  });
});

describe('GET /api/schools/[school]/match-report', () => {
  it('returns the whole report and filters entries by method', async () => {
    const full = await json<MatchReport>(await matchReport(req('/x'), ctx({ school: REAL })));
    expect(full.entries.length).toBeGreaterThan(0);
    const filtered = await json<MatchReport>(await matchReport(req('/x?method=grades-only'), ctx({ school: REAL })));
    expect(filtered.entries.every((e) => e.method === 'grades-only')).toBe(true);
    expect(filtered.entries.length).toBe(full.coverage.byMethod['grades-only'] ?? filtered.entries.length);
    expect(filtered.coverage).toEqual(full.coverage);
  });

  it('400 for an unknown method', async () => {
    const res = await matchReport(req('/x?method=guess'), ctx({ school: REAL }));
    expect(res.status).toBe(400);
    expect((await errorOf(res)).message).toMatch(/^method:/);
  });
});

// Path safety: every user-controlled segment is validated against a strict pattern before any lookup, so
// traversal attempts, prototype keys and oversized inputs are cheap 404s that never echo the input back.
describe('path safety', () => {
  const hostile = ['../', '..%2F..%2Fetc%2Fpasswd', '%2e%2e', '..\\..\\', 'constructor', '__proto__', 'prototype', 'a'.repeat(5_000), '<img src=x onerror=alert(1)>'];

  it('professor + summary routes: 404 for traversal / prototype / oversized slugs, body never contains the input', async () => {
    for (const slug of hostile) {
      for (const route of [professor, summary]) {
        const res = await route(req('/x'), ctx({ school: REAL, slug }));
        expect(res.status, slug).toBe(404);
        const text = await res.text();
        expect(text).not.toContain('onerror');
        expect(text).not.toContain('..');
        expect(text.length).toBeLessThan(200);
      }
    }
  });

  it('school segment: traversal and oversized values are 404 and not echoed', async () => {
    for (const school of ['../uiuc', '%2e%2e', 'constructor', 'x'.repeat(5_000)]) {
      const res = await subjects(req('/x'), ctx({ school }));
      expect(res.status).toBe(404);
      expect((await errorOf(res)).message).toBe('Unknown school');
    }
  });

  it('course segments: traversal, prototype keys and oversized values are 404', async () => {
    for (const [subject, number] of [['../CS', '225'], ['CS', '../225'], ['constructor', '225'], ['CS', 'x'.repeat(500)], ['%2e%2e', '225']]) {
      const res = await course(req('/x'), ctx({ school: REAL, subject, number }));
      expect(res.status).toBe(404);
      expect((await errorOf(res)).message).toBe('Unknown course');
    }
  });

  it('rankings / sections query: traversal in ?subject= is a 400 whose message describes the rule, not the input', async () => {
    for (const q of ['../CS', '%2e%2e%2fCS', 'constructor', 'C'.repeat(1_000)]) {
      const res = await rankings(req(`/x?subject=${encodeURIComponent(q)}`), ctx({ school: REAL }));
      expect(res.status).toBe(400);
      const message = (await errorOf(res)).message;
      expect(message).toMatch(/^subject:/);
      expect(message).not.toContain('..');
      expect((await sections(req(`/x?subject=${encodeURIComponent(q)}`), ctx({ school: REAL }))).status).toBe(400);
    }
  });
});
