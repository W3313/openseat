// zod query schemas for the GET routes (SPEC 4). Invalid → 400 via respond.ts. `subject` is upper-cased
// and must match /^[A-Z]{2,5}$/; `course` must match /^\d{3}[A-Z]?$/ after upper-casing.
import { z } from 'zod';
import type { MatchMethod, RankingsQuery, SortKey } from '@/lib/domain/types';

export const SubjectCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,5}$/, 'subject must be 2–5 letters, e.g. CS');

export const CourseNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^\d{3}[A-Z]?$/, 'course must be a 3-digit number with an optional letter, e.g. 225');

export const SlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lower-case letters, digits and dashes');

export const SortKeySchema = z.enum(['rating', 'overall', 'gpa', 'reviews'] satisfies readonly SortKey[]);

/** `open=1|0` (default 1) → boolean. */
export const OpenFlagSchema = z
  .enum(['0', '1'])
  .default('1')
  .transform((v) => v === '1');

export const MatchMethodSchema = z.enum([
  'alias', 'exact', 'first-token', 'initial', 'nickname', 'compound-last', 'fuzzy', 'ambiguous', 'unmatched', 'blocked',
] satisfies readonly MatchMethod[]);

/** /api/schools/[school]/rankings?subject=CS&sort=rating&open=1&course=225 */
export const RankingsQuerySchema = z.object({
  subject: SubjectCodeSchema,
  sort: SortKeySchema.default('rating'),
  open: OpenFlagSchema,
  course: CourseNumberSchema.optional(),
});
export type RankingsQueryParams = z.output<typeof RankingsQuerySchema>;

/** /api/schools/[school]/courses/[subject]/[number]?sort=&open= (subject/number come from the path). */
export const CourseRankingsQuerySchema = z.object({
  sort: SortKeySchema.default('rating'),
  open: OpenFlagSchema,
});
export type CourseRankingsQueryParams = z.output<typeof CourseRankingsQuerySchema>;

/** /api/schools/[school]/sections?subject=CS */
export const SectionsQuerySchema = z.object({ subject: SubjectCodeSchema });
export type SectionsQueryParams = z.output<typeof SectionsQuerySchema>;

/** /api/schools/[school]/match-report?method=initial */
export const MatchReportQuerySchema = z.object({ method: MatchMethodSchema.optional() });
export type MatchReportQueryParams = z.output<typeof MatchReportQuerySchema>;

export type QueryParseResult<T> = { ok: true; data: T } | { ok: false; message: string };

function toRecord(source: Request | URL | URLSearchParams | string): Record<string, string> {
  const params =
    source instanceof URLSearchParams
      ? source
      : source instanceof URL
        ? source.searchParams
        : typeof source === 'string'
          ? new URL(source, 'http://localhost').searchParams
          : new URL(source.url).searchParams;
  const out: Record<string, string> = {};
  for (const [k, v] of params) out[k] = v; // last value wins for repeated keys
  return out;
}

/** "subject: must match …; sort: Invalid option …" */
export function formatZodIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || 'query'}: ${i.message}`).join('; ');
}

/** Parse a request/URL/param set against a schema. Never throws. */
export function parseQuery<S extends z.ZodType>(
  schema: S,
  source: Request | URL | URLSearchParams | string,
): QueryParseResult<z.output<S>> {
  const result = schema.safeParse(toRecord(source));
  return result.success ? { ok: true, data: result.data } : { ok: false, message: formatZodIssues(result.error) };
}

/** Convert parsed route params into the domain RankingsQuery consumed by applyRankingsQuery(). */
export function toRankingsQuery(params: { sort: SortKey; open: boolean; course?: string }): RankingsQuery {
  const query: RankingsQuery = { sort: params.sort, openOnly: params.open };
  if (params.course) query.course = params.course;
  return query;
}
