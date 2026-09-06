import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseClock,
  parseCourseExplorerXml,
  parseCourseListXml,
  parseDays,
  parseTermsXml,
  resolveScheduleTerm,
  statusFromCode,
} from '@/lib/sources/uiuc/parseCourseExplorerXml';
import { CourseExplorerHttpError, CourseExplorerSource, Semaphore } from '@/lib/sources/uiuc/CourseExplorerSource';

const fx = (name: string) => readFileSync(path.join(process.cwd(), 'tests', 'fixtures', name), 'utf8');
const YEAR_XML = fx('course-explorer-2026.xml');
const CS_XML = fx('course-explorer-CS.xml');
const CASCADE_XML = fx('course-explorer-CS-225.cascade.xml');
const BASE = 'https://courses.illinois.edu/cisapp/explorer/schedule';

describe('parseCourseExplorerXml (cascade fixture)', () => {
  const course = parseCourseExplorerXml(CASCADE_XML, { subject: 'CS', number: '225' });
  const byCrn = Object.fromEntries(course.sections.map((s) => [s.crn, s]));

  it('yields one RawSection per detailedSection with crn/sectionCode/subject/number', () => {
    expect(course.title).toBe('Data Structures');
    expect(course.sections).toHaveLength(4);
    expect(byCrn['65054']).toMatchObject({ crn: '65054', sectionCode: 'AL1', subject: 'CS', number: '225', seatsKnown: false });
  });

  it('trims the leading-space instructor bug and dedupes across meetings', () => {
    expect(byCrn['65054'].instructorsRaw).toEqual(['Okonkwo, A', 'Sorensen, H']);
    expect(byCrn['65057'].instructorsRaw).toEqual(['Farrow, K']);
  });

  it('handles empty <instructors/>', () => {
    expect(byCrn['65055'].instructorsRaw).toEqual([]);
    expect(byCrn['65055'].meetings[0].type).toBe('LBD');
  });

  it('maps an ARRANGED meeting to no days and null times', () => {
    const m = byCrn['65056'].meetings[0];
    expect(m).toEqual({ days: [], start: null, end: null, building: null, room: null, type: 'ONL' });
  });

  it('converts 12-hour clocks to 24-hour HH:MM', () => {
    const m = byCrn['65054'].meetings[0];
    expect(m.start).toBe('12:30');
    expect(m.end).toBe('13:45');
    expect(m.days).toEqual(['T', 'R']);
    expect(m.building).toBe('Foellinger Auditorium');
    expect(m.room).toBe('AUD');
    expect(parseClock('11:00AM')).toBe('11:00');
    expect(parseClock('12:05AM')).toBe('00:05');
    expect(parseClock('ARRANGED')).toBeNull();
    expect(parseClock(undefined)).toBeNull();
    expect(parseDays('MWF')).toEqual(['M', 'W', 'F']);
    expect(parseDays('')).toEqual([]);
  });

  it('maps statusCode A → offered and anything else → inactive', () => {
    expect(byCrn['65054'].statusCode).toBe('A');
    expect(byCrn['65057'].statusCode).toBe('X');
    expect(statusFromCode('A')).toBe('offered');
    expect(statusFromCode('X')).toBe('inactive');
    expect(statusFromCode('P')).toBe('inactive');
  });

  it('parses a single detailedSection as an array (isArray gotcha)', () => {
    const single = CASCADE_XML.replace(/<detailedSection id="6505[567]"[\s\S]*?<\/detailedSection>/g, '');
    const one = parseCourseExplorerXml(single, { subject: 'CS' });
    expect(one.number).toBe('225');
    expect(one.sections).toHaveLength(1);
    expect(one.sections[0].meetings).toHaveLength(1);
  });
});

describe('term and course list parsing', () => {
  it('parses terms by text, not id', () => {
    const terms = parseTermsXml(YEAR_XML);
    expect(terms.map((t) => t.term)).toEqual(['2026-sp', '2026-su', '2026-fa']);
    expect(terms[2].text).toBe('Fall 2026');
  });

  it('resolves the requested term or the latest published ≤ requested', () => {
    expect(resolveScheduleTerm('2026-fa', ['2026-sp', '2026-su', '2026-fa'])).toBe('2026-fa');
    expect(resolveScheduleTerm('2026-fa', ['2026-sp', '2026-su'])).toBe('2026-su');
    expect(resolveScheduleTerm('2026-sp', ['2026-su', '2026-fa'])).toBeNull();
  });

  it('parses the course list', () => {
    const courses = parseCourseListXml(CS_XML);
    expect(courses).toHaveLength(7);
    expect(courses[3]).toEqual({ number: '225', title: 'Data Structures' });
  });
});

// ---------------------------------------------------------------------------------- fake network

type Route = (url: string, hit: number) => { status: number; body?: string } | 'timeout';

function fakeFetch(routes: Record<string, Route>, calls: string[] = []): typeof fetch {
  const hits = new Map<string, number>();
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    const n = (hits.get(url) ?? 0) + 1;
    hits.set(url, n);
    const route = routes[url];
    const r = route ? route(url, n) : { status: 404 };
    if (r === 'timeout') {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    }
    return new Response(r.body ?? '', { status: r.status });
  }) as unknown as typeof fetch;
}

const ok = (body: string): Route => () => ({ status: 200, body });
const noSleep = async () => {};

function makeSource(routes: Record<string, Route>, calls: string[] = [], extra: Record<string, unknown> = {}) {
  const logs: string[] = [];
  const src = new CourseExplorerSource({
    fetchImpl: fakeFetch(routes, calls), useCache: false, sleep: noSleep, delayMs: 0,
    log: { info: (m) => logs.push(m), warn: (m) => logs.push(m) }, ...extra,
  });
  return { src, logs };
}

const baseRoutes: Record<string, Route> = {
  [`${BASE}/2026.xml`]: ok(YEAR_XML),
  [`${BASE}/2026/fall/CS.xml`]: ok(CS_XML),
  [`${BASE}/2026/fall/CS/225.xml?mode=cascade`]: ok(CASCADE_XML),
  // every other course in the list 404s ("not offered")
};

describe('CourseExplorerSource', () => {
  it('fetches term → course list → cascade per course; 404 courses are skipped silently', async () => {
    const calls: string[] = [];
    const { src } = makeSource(baseRoutes, calls);
    expect(src.info.id).toBe('uiuc-course-explorer');
    const out = await src.fetchSections({ schoolId: 'uiuc', term: '2026-fa', subject: 'CS' });
    expect(out.term).toBe('2026-fa');
    expect(out.sections).toHaveLength(4);
    expect(out.sections.every((s) => s.number === '225')).toBe(true);
    expect(Date.parse(out.fetchedAt)).not.toBeNaN();
    expect(calls.filter((u) => u.includes('mode=cascade'))).toHaveLength(7);   // 1 + 1 + N topology
    expect(src.stats.notFound).toBe(6);
  });

  it('falls back to the latest published term when the season is missing', async () => {
    const noFall = YEAR_XML.replace(/<term id="120268"[^<]*<\/term>/, '');
    const { src, logs } = makeSource({
      [`${BASE}/2026.xml`]: ok(noFall),
      [`${BASE}/2026/summer/CS.xml`]: ok(CS_XML.replace(/fall/g, 'summer')),
      [`${BASE}/2026/summer/CS/225.xml?mode=cascade`]: ok(CASCADE_XML),
    });
    const out = await src.fetchSections({ schoolId: 'uiuc', term: '2026-fa', subject: 'CS' });
    expect(out.term).toBe('2026-su');
    expect(out.sections).toHaveLength(4);
    expect(logs.some((l) => /falling back to 2026-su/.test(l))).toBe(true);
  });

  it('looks back one calendar year when the requested year is not published', async () => {
    const { src } = makeSource({
      [`${BASE}/2025.xml`]: ok(YEAR_XML.replace(/2026/g, '2025')),
      [`${BASE}/2025/fall/CS.xml`]: ok(CS_XML),
    });
    const out = await src.fetchSections({ schoolId: 'uiuc', term: '2026-sp', subject: 'CS' });
    expect(out.term).toBe('2025-fa');
    expect(out.sections).toEqual([]);
  });

  it('throws when no published term ≤ requested exists', async () => {
    const { src } = makeSource({});
    await expect(src.fetchSections({ schoolId: 'uiuc', term: '2026-fa', subject: 'CS' })).rejects.toThrowError(/no published term/);
  });

  it('returns [] when the subject is missing from the term (course list 404)', async () => {
    const { src } = makeSource({ [`${BASE}/2026.xml`]: ok(YEAR_XML) });
    const out = await src.fetchSections({ schoolId: 'uiuc', term: '2026-fa', subject: 'ZZZ' });
    expect(out).toMatchObject({ term: '2026-fa', sections: [] });
  });

  it('retries 5xx and timeouts with backoff, then succeeds', async () => {
    const slept: number[] = [];
    const { src } = makeSource(
      {
        ...baseRoutes,
        [`${BASE}/2026/fall/CS/225.xml?mode=cascade`]: (_u, hit) =>
          hit === 1 ? { status: 503 } : hit === 2 ? 'timeout' : { status: 200, body: CASCADE_XML },
      },
      [],
      { sleep: async (ms: number) => { slept.push(ms); } },
    );
    const out = await src.fetchSections({ schoolId: 'uiuc', term: '2026-fa', subject: 'CS' });
    expect(out.sections).toHaveLength(4);
    expect(src.stats.retries).toBe(2);
    expect(slept).toEqual([500, 1500]);
  });

  it('gives up after 3 retries on persistent 5xx and does not retry other 4xx', async () => {
    const { src } = makeSource({ ...baseRoutes, [`${BASE}/2026/fall/CS/225.xml?mode=cascade`]: () => ({ status: 500 }) });
    await expect(src.fetchSections({ schoolId: 'uiuc', term: '2026-fa', subject: 'CS' })).rejects.toThrowError(CourseExplorerHttpError);
    expect(src.stats.retries).toBe(3);
    const { src: forbidden } = makeSource({ ...baseRoutes, [`${BASE}/2026/fall/CS/225.xml?mode=cascade`]: () => ({ status: 403 }) });
    await expect(forbidden.fetchSections({ schoolId: 'uiuc', term: '2026-fa', subject: 'CS' })).rejects.toThrowError(/403/);
    expect(forbidden.stats.retries).toBe(0);
  });

  it('semaphore caps concurrency', async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        const release = await sem.acquire();
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 2));
        active -= 1;
        release();
      }),
    );
    expect(peak).toBe(2);
  });
});
