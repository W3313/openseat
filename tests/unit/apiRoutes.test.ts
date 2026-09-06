// SPEC 4 / 12.3: every GET handler called directly with a Request against the committed placeholder
// dataset (data/processed/uiuc) — no server. Asserts status codes, error shape, cache headers and the
// summary route's cached / extractive / too_few_reviews branches. applyRankingsQuery (scoring module) is
// replaced by a small deterministic stand-in so this file only exercises the route wiring.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MatchReport, ProfessorDetail, RankingsPayload, RankingsQuery, RankingsResponse } from '@/lib/domain/types';
import type { HealthResponse, SchoolsResponse, SectionsResponse, SubjectsResponse, SummaryResponse } from '@/lib/api/types';
import type { ApiErrorBody } from '@/lib/api/respond';
import { API_CACHE_CONTROL } from '@/lib/api/respond';
import { setApiErrorLogger } from '@/lib/api/handlers';
import { buildSummaryResponse } from '@/lib/api/summary';
import { getRepository, setRepository, type Repository } from '@/lib/repo';
import { GET as health } from '@/app/api/health/route';
import { GET as schools } from '@/app/api/schools/route';
import { GET as subjects } from '@/app/api/schools/[school]/subjects/route';
import { GET as rankings } from '@/app/api/schools/[school]/rankings/route';
import { GET as course } from '@/app/api/schools/[school]/courses/[subject]/[number]/route';
import { GET as professor } from '@/app/api/schools/[school]/professors/[slug]/route';
import { GET as summary } from '@/app/api/schools/[school]/professors/[slug]/summary/route';
import { GET as sections } from '@/app/api/schools/[school]/sections/route';
import { GET as matchReport } from '@/app/api/schools/[school]/match-report/route';

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

// Slugs are resolved from the committed dataset at test time so the file does not pin fictional names.
let KNOWN_SLUG = '';        // a reviewed professor with >= 3 reviews
let KNOWN_ID = '';
let LOW_DATA_SLUG = '';     // fewer than 3 reviews -> too_few_reviews
beforeAll(async () => {
  const repo = getRepository();
  const all = await repo.getProfessors('uiuc');
  const details = await Promise.all(all.map((p) => repo.getProfessorBySlug('uiuc', p.slug)));
  const known = details.find((d) => d !== null && d.professor.kind === 'reviewed' && d.scores.reviewCount >= 3 && d.reviews.length >= 3);
  const low = details.find((d) => d !== null && d.scores.reviewCount < 3);
  if (!known || !low) throw new Error('dataset lacks a reviewed (>= 3 reviews) or a low-data (< 3 reviews) professor');
  KNOWN_SLUG = known.professor.slug;
  KNOWN_ID = known.professor.id;
  LOW_DATA_SLUG = low.professor.slug;
});

beforeAll(() => setApiErrorLogger(() => {}));
afterAll(() => setApiErrorLogger(null));
afterEach(() => setRepository(null));

describe('headers and error shape', () => {
  it('every success sets the shared Cache-Control and JSON content type', async () => {
    const res = await health();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe(API_CACHE_CONTROL);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
  });

  it('404 for an unknown school uses { error: { code, message } } and stays cacheable', async () => {
    const res = await subjects(req('/api/schools/mit/subjects'), ctx({ school: 'mit' }));
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe(API_CACHE_CONTROL);
    const error = await errorOf(res);
    expect(error.code).toBe('not_found');
    expect(error.message).toContain('mit');
  });

  it('500 when the repository throws: generic message, no-store, no stack', async () => {
    const boom: Partial<Repository> = { getMeta: async () => { throw new Error('disk on fire /secret/path'); } };
    setRepository(boom as Repository);
    const res = await health();
    expect(res.status).toBe(500);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const error = await errorOf(res);
    expect(error.code).toBe('internal');
    expect(error.message).not.toContain('secret');
  });
});

describe('GET /api/health and /api/schools', () => {
  it('health mirrors meta.json', async () => {
    const body = await json<HealthResponse>(await health());
    expect(body.ok).toBe(true);
    expect(body.mode).toBe('demo');
    expect(body.currentTerm).toMatch(/^\d{4}-(wi|sp|su|fa)$/);
    expect(body.datasetHash).toHaveLength(64);
    expect(body.aiSummaries).toEqual({ claude: body.counts.summariesClaude, openaiCompatible: body.counts.summariesOpenAiCompatible ?? 0, extractive: body.counts.summariesExtractive });
  });

  it('schools lists uiuc', async () => {
    const body = await json<SchoolsResponse>(await schools());
    expect(body.schools.map((s) => s.id)).toContain('uiuc');
  });
});

describe('GET /api/schools/[school]/subjects', () => {
  it('returns only subjects with ≥ 1 professor and accepts an upper-cased school segment', async () => {
    const body = await json<SubjectsResponse>(await subjects(req('/x'), ctx({ school: 'UIUC' })));
    expect(body.subjects.length).toBeGreaterThan(0);
    expect(body.subjects.every((s) => s.professorCount >= 1)).toBe(true);
    expect(body.subjects.map((s) => s.code)).toContain('CS');
  });
});

describe('GET /api/schools/[school]/rankings', () => {
  it('400 on a missing or malformed subject', async () => {
    const missing = await rankings(req('/api/schools/uiuc/rankings'), ctx({ school: 'uiuc' }));
    expect(missing.status).toBe(400);
    expect((await errorOf(missing)).code).toBe('bad_query');
    const bad = await rankings(req('/api/schools/uiuc/rankings?subject=CS&sort=nope'), ctx({ school: 'uiuc' }));
    expect(bad.status).toBe(400);
  });

  it('404 on an unknown subject; 404 on unknown school beats a valid query', async () => {
    expect((await rankings(req('/x?subject=ZZZ'), ctx({ school: 'uiuc' }))).status).toBe(404);
    expect((await rankings(req('/x?subject=CS'), ctx({ school: 'nope' }))).status).toBe(404);
  });

  it('applies the query server-side and echoes it', async () => {
    const res = await rankings(req('/x?subject=cs&sort=gpa&open=0&course=225'), ctx({ school: 'uiuc' }));
    expect(res.status).toBe(200);
    const body = await json<RankingsResponse>(res);
    expect(body.query).toEqual({ sort: 'gpa', openOnly: false, course: '225' });
    expect(body.subject.code).toBe('CS');
    expect(body.scope).toEqual({ kind: 'subject' });
    expect(body.ranked.every((p) => p.rank !== null && p.scores.reviewCount >= 3)).toBe(true);
    expect(body.lowData.every((p) => p.scores.reviewCount < 3)).toBe(true);
    expect(body).not.toHaveProperty('professors');
  });
});

describe('GET /api/schools/[school]/courses/[subject]/[number]', () => {
  it('returns a course-scoped RankingsResponse', async () => {
    const res = await course(req('/x?open=0'), ctx({ school: 'uiuc', subject: 'cs', number: '225' }));
    expect(res.status).toBe(200);
    const body = await json<RankingsResponse>(res);
    expect(body.scope).toEqual({ kind: 'course', courseId: 'uiuc:CS:225' });
    expect(body.query).toEqual({ sort: 'rating', openOnly: false, course: '225' });
    expect(body.ranked.length + body.lowData.length).toBeGreaterThan(0);
  });

  it('404 for unknown / malformed course segments, 400 for a bad query', async () => {
    expect((await course(req('/x'), ctx({ school: 'uiuc', subject: 'CS', number: '999' }))).status).toBe(404);
    expect((await course(req('/x'), ctx({ school: 'uiuc', subject: 'C', number: '225' }))).status).toBe(404);
    expect((await course(req('/x'), ctx({ school: 'uiuc', subject: 'CS', number: '22' }))).status).toBe(404);
    expect((await course(req('/x?open=2'), ctx({ school: 'uiuc', subject: 'CS', number: '225' }))).status).toBe(400);
  });
});

describe('GET /api/schools/[school]/professors/[slug]', () => {
  it('returns the ProfessorDetail for a known slug', async () => {
    const res = await professor(req('/x'), ctx({ school: 'uiuc', slug: KNOWN_SLUG }));
    expect(res.status).toBe(200);
    const body = await json<ProfessorDetail>(res);
    expect(body.professor.slug).toBe(KNOWN_SLUG);
    expect(Array.isArray(body.reviews)).toBe(true);
    expect(body.scores.reviewCount).toBeGreaterThanOrEqual(3);
  });

  it('404 for unknown and malformed slugs', async () => {
    expect((await professor(req('/x'), ctx({ school: 'uiuc', slug: 'nobody-here' }))).status).toBe(404);
    expect((await professor(req('/x'), ctx({ school: 'uiuc', slug: 'bad slug!' }))).status).toBe(404);
  });
});

describe('GET /api/schools/[school]/professors/[slug]/summary', () => {
  it('returns a summary for a reviewed professor and says whether it was cached', async () => {
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
    const body = await json<SummaryResponse>(await summary(req('/x'), ctx({ school: 'uiuc', slug: LOW_DATA_SLUG })));
    expect(body).toEqual({ summary: null, cached: false, reason: 'too_few_reviews' });
  });

  it('computes the extractive summary at request time when nothing is cached', async () => {
    const detail = (await getRepository().getProfessorBySlug('uiuc', KNOWN_SLUG)) as ProfessorDetail;
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
    const detail = (await getRepository().getProfessorBySlug('uiuc', KNOWN_SLUG)) as ProfessorDetail;
    const first = await buildSummaryResponse({ ...detail, summary: null }, { getSummary: async () => null });
    // Whatever the first call produced has a hash valid for this input → a second call must treat it as cached.
    const second = await buildSummaryResponse({ ...detail, summary: first.summary }, { getSummary: async () => null });
    expect(second).toEqual({ summary: first.summary, cached: true });
  });

  it('404 for an unknown professor', async () => {
    expect((await summary(req('/x'), ctx({ school: 'uiuc', slug: 'nobody-here' }))).status).toBe(404);
  });
});

describe('GET /api/schools/[school]/sections', () => {
  it('400 without subject, 404 for an unknown subject', async () => {
    expect((await sections(req('/x'), ctx({ school: 'uiuc' }))).status).toBe(400);
    expect((await sections(req('/x?subject=ZZZ'), ctx({ school: 'uiuc' }))).status).toBe(404);
  });

  it('returns term, seatsFetchedAt and the subject\'s sections', async () => {
    const body = await json<SectionsResponse>(await sections(req('/x?subject=cs'), ctx({ school: 'uiuc' })));
    expect(body.term).toMatch(/^\d{4}-(wi|sp|su|fa)$/);
    expect(body.seatsFetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.sections.length).toBeGreaterThan(0);
    expect(body.sections.every((s) => s.courseId.startsWith('uiuc:CS:') || s.crossListedCourseIds.some((c) => c.startsWith('uiuc:CS:')))).toBe(true);
  });
});

describe('GET /api/schools/[school]/match-report', () => {
  it('returns the whole report and filters entries by method', async () => {
    const full = await json<MatchReport>(await matchReport(req('/x'), ctx({ school: 'uiuc' })));
    expect(full.entries.length).toBeGreaterThan(0);
    const filtered = await json<MatchReport>(await matchReport(req('/x?method=exact'), ctx({ school: 'uiuc' })));
    expect(filtered.entries.every((e) => e.method === 'exact')).toBe(true);
    expect(filtered.entries.length).toBe(full.coverage.byMethod.exact);
    expect(filtered.coverage).toEqual(full.coverage);
  });

  it('400 for an unknown method', async () => {
    const res = await matchReport(req('/x?method=guess'), ctx({ school: 'uiuc' }));
    expect(res.status).toBe(400);
    expect((await errorOf(res)).message).toMatch(/^method:/);
  });
});
