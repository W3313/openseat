// SPEC 4 / 12.3: zod query parsing for the GET routes — upper-casing, defaults, regex rejection, and the
// domain RankingsQuery conversion.
import { describe, expect, it } from 'vitest';
import {
  CourseNumberSchema, CourseRankingsQuerySchema, MatchReportQuerySchema, RankingsQuerySchema, SectionsQuerySchema,
  SlugSchema, SubjectCodeSchema, parseQuery, toRankingsQuery,
} from '@/lib/api/query';

describe('RankingsQuerySchema', () => {
  it('upper-cases subject and applies defaults (sort=rating, open=true)', () => {
    const r = parseQuery(RankingsQuerySchema, 'http://x/api?subject=cs');
    expect(r).toEqual({ ok: true, data: { subject: 'CS', sort: 'rating', open: true } });
  });

  it('parses every explicit param, including course upper-casing', () => {
    const r = parseQuery(RankingsQuerySchema, new URL('http://x/api?subject=ECE&sort=gpa&open=0&course=120a'));
    expect(r).toEqual({ ok: true, data: { subject: 'ECE', sort: 'gpa', open: false, course: '120A' } });
  });

  it('accepts a Request and URLSearchParams as sources', () => {
    expect(parseQuery(RankingsQuerySchema, new Request('http://x/api?subject=math&sort=reviews')).ok).toBe(true);
    expect(parseQuery(RankingsQuerySchema, new URLSearchParams({ subject: 'stat', open: '1' })).ok).toBe(true);
  });

  it('rejects a missing subject with a message naming the field', () => {
    const r = parseQuery(RankingsQuerySchema, 'http://x/api');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/^subject:/);
  });

  it.each(['C', 'CSCIEN', 'CS1', 'cs-'])('rejects subject %s', (subject) => {
    expect(parseQuery(RankingsQuerySchema, new URLSearchParams({ subject })).ok).toBe(false);
  });

  it.each(['22', '2255', '225AB', 'abc'])('rejects course %s', (course) => {
    expect(parseQuery(RankingsQuerySchema, new URLSearchParams({ subject: 'CS', course })).ok).toBe(false);
  });

  it('rejects an unknown sort key and a non-binary open flag', () => {
    expect(parseQuery(RankingsQuerySchema, 'http://x/?subject=CS&sort=best').ok).toBe(false);
    expect(parseQuery(RankingsQuerySchema, 'http://x/?subject=CS&open=yes').ok).toBe(false);
    expect(parseQuery(RankingsQuerySchema, 'http://x/?subject=CS&open=true').ok).toBe(false);
  });

  it('joins multiple issues with "; " and the last repeated value wins', () => {
    const r = parseQuery(RankingsQuerySchema, 'http://x/?subject=C&sort=zzz');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message.split('; ')).toHaveLength(2);
    const last = parseQuery(RankingsQuerySchema, 'http://x/?subject=C&subject=CS');
    expect(last).toEqual({ ok: true, data: { subject: 'CS', sort: 'rating', open: true } });
  });
});

describe('other schemas', () => {
  it('CourseRankingsQuerySchema defaults without a subject', () => {
    expect(parseQuery(CourseRankingsQuerySchema, 'http://x/')).toEqual({ ok: true, data: { sort: 'rating', open: true } });
  });

  it('SectionsQuerySchema requires subject and ignores extra params', () => {
    expect(parseQuery(SectionsQuerySchema, 'http://x/?subject=phys&foo=bar')).toEqual({ ok: true, data: { subject: 'PHYS' } });
    expect(parseQuery(SectionsQuerySchema, 'http://x/').ok).toBe(false);
  });

  it('MatchReportQuerySchema accepts every MatchMethod and rejects others', () => {
    expect(parseQuery(MatchReportQuerySchema, 'http://x/?method=compound-last')).toEqual({ ok: true, data: { method: 'compound-last' } });
    expect(parseQuery(MatchReportQuerySchema, 'http://x/')).toEqual({ ok: true, data: {} });
    expect(parseQuery(MatchReportQuerySchema, 'http://x/?method=guess').ok).toBe(false);
  });

  it('segment schemas trim and normalise case', () => {
    expect(SubjectCodeSchema.parse(' cs ')).toBe('CS');
    expect(CourseNumberSchema.parse('374a')).toBe('374A');
    expect(SlugSchema.parse('Adaeze-Okonkwo')).toBe('adaeze-okonkwo');
    expect(SlugSchema.safeParse('bad slug').success).toBe(false);
    expect(SlugSchema.safeParse('-leading').success).toBe(false);
  });
});

describe('toRankingsQuery', () => {
  it('maps open → openOnly and omits course when absent', () => {
    expect(toRankingsQuery({ sort: 'overall', open: false })).toEqual({ sort: 'overall', openOnly: false });
    expect(toRankingsQuery({ sort: 'rating', open: true, course: '225' })).toEqual({ sort: 'rating', openOnly: true, course: '225' });
  });
});
