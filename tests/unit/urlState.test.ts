// SPEC 12.3: RankingsQuery ↔ URLSearchParams round-trip with defaults omitted (+ picks and href builders).
import { describe, expect, it } from 'vitest';
import type { RankingsQuery } from '@/lib/domain/types';
import {
  DEFAULT_RANKINGS_QUERY,
  buildCompareHref,
  buildCourseHref,
  buildProfessorHref,
  buildRankingsHref,
  isRankingsQueryEqual,
  normalizeCourseNumber,
  normalizeSubjectCode,
  parsePicks,
  parseRankingsQuery,
  rankingsQueryToString,
  serializePicks,
  serializeRankingsQuery,
  toSearchParams,
  withRankingsQuery,
} from '@/lib/utils/urlState';

describe('rankings query ↔ URLSearchParams', () => {
  it('omits defaults entirely', () => {
    expect(serializeRankingsQuery({ sort: 'rating', openOnly: true }).toString()).toBe('');
    expect(rankingsQueryToString({ sort: 'rating', openOnly: true })).toBe('');
    expect(parseRankingsQuery('')).toEqual(DEFAULT_RANKINGS_QUERY);
    expect(parseRankingsQuery(null)).toEqual({ sort: 'rating', openOnly: true });
    expect(parseRankingsQuery(undefined)).toEqual({ sort: 'rating', openOnly: true });
  });

  it('serializes only non-default keys in the fixed order sort → open → course', () => {
    expect(rankingsQueryToString({ sort: 'overall', openOnly: false, course: '225' })).toBe('?sort=overall&open=0&course=225');
    expect(rankingsQueryToString({ sort: 'rating', openOnly: false })).toBe('?open=0');
    expect(rankingsQueryToString({ sort: 'gpa', openOnly: true })).toBe('?sort=gpa');
    expect(rankingsQueryToString({ sort: 'rating', openOnly: true, course: ' 225a ' })).toBe('?course=225A');
    expect(rankingsQueryToString({ sort: 'rating', openOnly: true, course: 'nope' })).toBe('');
  });

  it('round-trips every combination', () => {
    const queries: RankingsQuery[] = [
      { sort: 'rating', openOnly: true },
      { sort: 'overall', openOnly: true },
      { sort: 'gpa', openOnly: false },
      { sort: 'reviews', openOnly: false, course: '225' },
      { sort: 'rating', openOnly: true, course: '374A' },
    ];
    for (const q of queries) {
      const params = serializeRankingsQuery(q);
      expect(parseRankingsQuery(params)).toEqual(q);
      expect(parseRankingsQuery(rankingsQueryToString(q))).toEqual(q);
      expect(parseRankingsQuery(Object.fromEntries(params))).toEqual(q);
      expect(isRankingsQueryEqual(parseRankingsQuery(params), q)).toBe(true);
    }
  });

  it('parses leniently', () => {
    expect(parseRankingsQuery('?sort=bogus')).toEqual({ sort: 'rating', openOnly: true });
    expect(parseRankingsQuery('?open=false')).toEqual({ sort: 'rating', openOnly: false });
    expect(parseRankingsQuery('?open=1')).toEqual({ sort: 'rating', openOnly: true });
    expect(parseRankingsQuery('?open=yes')).toEqual({ sort: 'rating', openOnly: true });
    expect(parseRankingsQuery('?course=12')).toEqual({ sort: 'rating', openOnly: true });
    expect(parseRankingsQuery('?course=225a')).toEqual({ sort: 'rating', openOnly: true, course: '225A' });
    expect(parseRankingsQuery({ sort: ['gpa', 'reviews'], open: undefined })).toEqual({ sort: 'reviews', openOnly: true });
    expect(parseRankingsQuery({ sort: [] })).toEqual({ sort: 'rating', openOnly: true });
  });

  it('normalizes subject codes and course numbers', () => {
    expect(normalizeCourseNumber(' 225a ')).toBe('225A');
    expect(normalizeCourseNumber('22')).toBeUndefined();
    expect(normalizeCourseNumber(null)).toBeUndefined();
    expect(normalizeSubjectCode('cs')).toBe('CS');
    expect(normalizeSubjectCode('c')).toBeUndefined();
    expect(normalizeSubjectCode(undefined)).toBeUndefined();
  });

  it('replaces only the three query keys and keeps unrelated ones', () => {
    const next = withRankingsQuery('?sort=gpa&open=0&course=225&picks=a-b,c', { sort: 'rating', openOnly: true });
    expect(next.toString()).toBe('picks=a-b%2Cc');
    const again = withRankingsQuery(next, { sort: 'overall', openOnly: false });
    expect(again.get('picks')).toBe('a-b,c');
    expect(again.get('sort')).toBe('overall');
    expect(again.get('open')).toBe('0');
    expect(again.has('course')).toBe(false);
  });

  it('compares queries treating a missing course as undefined', () => {
    expect(isRankingsQueryEqual({ sort: 'rating', openOnly: true }, { sort: 'rating', openOnly: true, course: undefined })).toBe(true);
    expect(isRankingsQueryEqual({ sort: 'rating', openOnly: true }, { sort: 'rating', openOnly: false })).toBe(false);
  });

  it('accepts every QueryInput shape', () => {
    expect(toSearchParams('?a=1').get('a')).toBe('1');
    expect(toSearchParams('a=1').get('a')).toBe('1');
    expect(toSearchParams(new URLSearchParams('a=1')).get('a')).toBe('1');
    expect(toSearchParams({ a: '1', b: ['x', 'y'], c: undefined }).toString()).toBe('a=1&b=y');
    expect(toSearchParams(null).toString()).toBe('');
  });
});

describe('picks', () => {
  it('parses, dedupes and validates slugs', () => {
    expect(parsePicks('?picks=a-b,c,A-B,,not valid,c')).toEqual(['a-b', 'c']);
    expect(parsePicks('?p=x,y', 'p')).toEqual(['x', 'y']);
    expect(parsePicks('')).toEqual([]);
  });
  it('serializes to a comma list or null', () => {
    expect(serializePicks(['a', ' B ', 'a', 'bad slug'])).toBe('a,b');
    expect(serializePicks([])).toBeNull();
  });
});

describe('href builders', () => {
  it('builds rankings hrefs with defaults omitted', () => {
    expect(buildRankingsHref('uiuc', 'cs')).toBe('/s/uiuc/CS');
    expect(buildRankingsHref('uiuc', 'CS', { openOnly: false })).toBe('/s/uiuc/CS?open=0');
    expect(buildRankingsHref('uiuc', 'CS', { sort: 'gpa', course: '225' }, ['a', 'b'])).toBe('/s/uiuc/CS?sort=gpa&course=225&picks=a%2Cb');
  });
  it('builds course hrefs with course in the path, never the query', () => {
    expect(buildCourseHref('uiuc', 'cs', '225')).toBe('/s/uiuc/CS/225');
    expect(buildCourseHref('uiuc', 'CS', '225', { sort: 'overall', course: '374' })).toBe('/s/uiuc/CS/225?sort=overall');
  });
  it('builds professor and compare hrefs', () => {
    expect(buildProfessorHref('uiuc', 'adaeze-okonkwo')).toBe('/p/uiuc/adaeze-okonkwo');
    expect(buildCompareHref('uiuc', ['a', 'b'])).toBe('/compare/uiuc?p=a%2Cb');
    expect(buildCompareHref('uiuc', [])).toBe('/compare/uiuc');
  });
});
