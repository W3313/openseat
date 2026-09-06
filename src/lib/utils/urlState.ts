// Shareable URL state for the rankings page (SPEC 3.2, F17): RankingsQuery ↔ URLSearchParams with
// defaults omitted, plus `picks` and href builders. Pure; used by client islands and the API routes.
import type { RankingsQuery, SortKey } from '@/lib/domain/types';

export const SORT_KEYS: readonly SortKey[] = ['rating', 'overall', 'gpa', 'reviews'];
export const DEFAULT_SORT: SortKey = 'rating';
export const DEFAULT_RANKINGS_QUERY: Readonly<RankingsQuery> = Object.freeze({ sort: DEFAULT_SORT, openOnly: true });

export const SUBJECT_CODE_RE = /^[A-Z]{2,5}$/;
export const COURSE_NUMBER_RE = /^\d{3}[A-Z]?$/;
const SLUG_LIST_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === 'string' && (SORT_KEYS as readonly string[]).includes(value);
}

/** Anything Next or the browser hands us: URLSearchParams, a "?a=b" string, or a searchParams record. */
export type QueryInput = URLSearchParams | string | Record<string, string | string[] | undefined> | null | undefined;

export function toSearchParams(input: QueryInput): URLSearchParams {
  if (!input) return new URLSearchParams();
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  if (typeof input === 'string') return new URLSearchParams(input.startsWith('?') ? input.slice(1) : input);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value[value.length - 1]);
    } else {
      params.set(key, value);
    }
  }
  return params;
}

/** " 225a " → "225A"; anything not matching /^\d{3}[A-Z]?$/ → undefined. */
export function normalizeCourseNumber(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const v = value.trim().toUpperCase();
  return COURSE_NUMBER_RE.test(v) ? v : undefined;
}

/** "cs" → "CS"; invalid → undefined. */
export function normalizeSubjectCode(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const v = value.trim().toUpperCase();
  return SUBJECT_CODE_RE.test(v) ? v : undefined;
}

/**
 * Lenient parse for client-side use: unknown sort → "rating", `open` is false only for "0"/"false",
 * invalid course → omitted. (API routes use the strict zod schemas in src/lib/api/query.ts instead.)
 */
export function parseRankingsQuery(input: QueryInput): RankingsQuery {
  const params = toSearchParams(input);
  const sortRaw = params.get('sort');
  const openRaw = params.get('open');
  const course = normalizeCourseNumber(params.get('course'));
  const query: RankingsQuery = {
    sort: isSortKey(sortRaw) ? sortRaw : DEFAULT_SORT,
    openOnly: !(openRaw === '0' || openRaw === 'false'),
  };
  if (course) query.course = course;
  return query;
}

/** Only non-default keys, in the fixed order sort → open → course. */
export function serializeRankingsQuery(query: RankingsQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.sort !== DEFAULT_SORT) params.set('sort', query.sort);
  if (!query.openOnly) params.set('open', '0');
  const course = normalizeCourseNumber(query.course);
  if (course) params.set('course', course);
  return params;
}

/** "" for the default query, otherwise "?sort=overall&open=0&course=225". */
export function rankingsQueryToString(query: RankingsQuery): string {
  const s = serializeRankingsQuery(query).toString();
  return s ? `?${s}` : '';
}

/** Replace the three query keys in an existing param set (keeps unrelated keys such as `picks`). */
export function withRankingsQuery(existing: QueryInput, query: RankingsQuery): URLSearchParams {
  const params = toSearchParams(existing);
  params.delete('sort');
  params.delete('open');
  params.delete('course');
  for (const [k, v] of serializeRankingsQuery(query)) params.set(k, v);
  return params;
}

export function isRankingsQueryEqual(a: RankingsQuery, b: RankingsQuery): boolean {
  return a.sort === b.sort && a.openOnly === b.openOnly && (a.course ?? undefined) === (b.course ?? undefined);
}

/** `picks=a,b,c` → ["a","b","c"] (deduped, slug-shaped only, order kept). Accepts `p=` too (compare page). */
export function parsePicks(input: QueryInput, key: 'picks' | 'p' = 'picks'): string[] {
  const raw = toSearchParams(input).get(key);
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const slug = part.trim().toLowerCase();
    if (SLUG_LIST_RE.test(slug) && !out.includes(slug)) out.push(slug);
  }
  return out;
}

/** ["a","b"] → "a,b"; [] → null (so the key can be omitted). */
export function serializePicks(picks: readonly string[]): string | null {
  const clean = [...new Set(picks.map((p) => p.trim().toLowerCase()).filter((p) => SLUG_LIST_RE.test(p)))];
  return clean.length ? clean.join(',') : null;
}

export function buildRankingsHref(
  schoolId: string,
  subject: string,
  query: Partial<RankingsQuery> = {},
  picks: readonly string[] = [],
): string {
  const params = serializeRankingsQuery({ ...DEFAULT_RANKINGS_QUERY, ...query });
  const p = serializePicks(picks);
  if (p) params.set('picks', p);
  const s = params.toString();
  return `/s/${encodeURIComponent(schoolId)}/${encodeURIComponent(subject.toUpperCase())}${s ? `?${s}` : ''}`;
}

export function buildCourseHref(schoolId: string, subject: string, number: string, query: Partial<RankingsQuery> = {}): string {
  const { course: _ignored, ...rest } = query; // course is the path on this route
  void _ignored;
  const params = serializeRankingsQuery({ ...DEFAULT_RANKINGS_QUERY, ...rest });
  const s = params.toString();
  return `/s/${encodeURIComponent(schoolId)}/${encodeURIComponent(subject.toUpperCase())}/${encodeURIComponent(number)}${s ? `?${s}` : ''}`;
}

export function buildProfessorHref(schoolId: string, slug: string): string {
  return `/p/${encodeURIComponent(schoolId)}/${encodeURIComponent(slug)}`;
}

/** "/compare/uiuc?p=a,b" — 2–3 slugs expected by the page; fewer still yields a valid URL. */
export function buildCompareHref(schoolId: string, picks: readonly string[]): string {
  const p = serializePicks(picks);
  return `/compare/${encodeURIComponent(schoolId)}${p ? `?p=${encodeURIComponent(p)}` : ''}`;
}
