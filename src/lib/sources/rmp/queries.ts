// GraphQL documents, zod response schemas and field normalizers for the unofficial RateMyProfessors
// API (SPEC 6.2 "rmp/RmpReviewSource.ts", SOURCE_FACTS 3). Pure — no network here.
import { z } from 'zod';

export const RMP_GRAPHQL_ENDPOINT = 'https://www.ratemyprofessors.com/graphql';
// No default Authorization value is shipped: the operator supplies RMP_AUTH_HEADER consciously (RMP_ENABLED=1).

export const SCHOOL_SEARCH_QUERY = `
query SchoolSearch($text: String!) {
  newSearch {
    schools(query: { text: $text }) {
      edges { node { id name city state } }
    }
  }
}`.trim();

export const TEACHER_SEARCH_QUERY = `
query TeacherSearch($text: String!, $schoolID: ID!, $first: Int!, $after: String) {
  newSearch {
    teachers(query: { text: $text, schoolID: $schoolID }, first: $first, after: $after) {
      edges {
        cursor
        node { id legacyId firstName lastName department avgRating avgDifficulty numRatings wouldTakeAgainPercent }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`.trim();

export const TEACHER_RATINGS_QUERY = `
query TeacherRatings($id: ID!, $count: Int!) {
  node(id: $id) {
    ... on Teacher {
      id
      ratings(first: $count) {
        edges {
          node {
            id legacyId class comment date helpfulRating clarityRating difficultyRating grade
            wouldTakeAgain thumbsUpTotal thumbsDownTotal ratingTags
          }
        }
      }
    }
  }
}`.trim();

// ------------------------------------------------------------------------------------------ schemas

const nullableNumber = z.number().nullable().optional();
const nullableString = z.string().nullable().optional();

export const SchoolNodeSchema = z.object({
  id: z.string(), name: z.string(), city: nullableString, state: nullableString,
});
export const SchoolSearchResponseSchema = z.object({
  data: z.object({
    newSearch: z.object({
      schools: z.object({ edges: z.array(z.object({ node: SchoolNodeSchema })) }),
    }),
  }),
});

export const TeacherNodeSchema = z.object({
  id: z.string(),
  legacyId: z.union([z.number(), z.string()]).nullable().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  department: nullableString,
  avgRating: nullableNumber,
  avgDifficulty: nullableNumber,
  numRatings: nullableNumber,
  wouldTakeAgainPercent: nullableNumber,
});
export type TeacherNode = z.infer<typeof TeacherNodeSchema>;

export const TeacherSearchResponseSchema = z.object({
  data: z.object({
    newSearch: z.object({
      teachers: z.object({
        edges: z.array(z.object({ cursor: z.string().optional(), node: TeacherNodeSchema })),
        pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: nullableString }).optional(),
      }),
    }),
  }),
});

export const RatingNodeSchema = z.object({
  id: z.string(),
  legacyId: z.union([z.number(), z.string()]).nullable().optional(),
  class: nullableString,
  comment: nullableString,
  date: nullableString,
  helpfulRating: nullableNumber,
  clarityRating: nullableNumber,
  difficultyRating: nullableNumber,
  grade: nullableString,
  wouldTakeAgain: z.union([z.number(), z.boolean()]).nullable().optional(),
  thumbsUpTotal: nullableNumber,
  thumbsDownTotal: nullableNumber,
  ratingTags: nullableString,
});
export type RatingNode = z.infer<typeof RatingNodeSchema>;

export const TeacherRatingsResponseSchema = z.object({
  data: z.object({
    node: z
      .object({ id: z.string().optional(), ratings: z.object({ edges: z.array(z.object({ node: RatingNodeSchema })) }).optional() })
      .nullable(),
  }),
});

// -------------------------------------------------------------------------------------- normalizers

/** "CS225" | "cs 225" | " Cs-225 " → "CS 225"; unparseable/empty → null. */
export function normalizeCourseLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const compact = raw.replace(/[\s\-_.]/g, '').toUpperCase();
  const m = /^([A-Z]{2,5})(\d{3}[A-Z]?)$/.exec(compact);
  return m ? `${m[1]} ${m[2]}` : compact === '' ? null : compact;
}

/** "Tough grader--Caring--Get ready to read" → ["Tough grader", "Caring", "Get ready to read"]. */
export function splitRatingTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split('--').map((t) => t.trim()).filter(Boolean);
}

/** RMP `wouldTakeAgain`: 1 → true, 0 → false, anything else (−1, null) → unknown. */
export function wouldTakeAgainFlag(v: number | boolean | null | undefined): boolean | null {
  if (typeof v === 'boolean') return v;
  if (v === 1) return true;
  if (v === 0) return false;
  return null;
}

/** RMP dates look like "2024-05-01 12:34:56 +0000 UTC"; return ISO when parseable, else the raw text. */
export function normalizeRmpDate(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = raw.replace(/\s+UTC$/, '').replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/, '$1T$2');
  const t = Date.parse(cleaned);
  return Number.isNaN(t) ? raw : new Date(t).toISOString();
}

/** Grade strings: '' | 'Not sure yet' | 'Rather not say' → null; otherwise upper-cased trimmed. */
export function normalizeGrade(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const g = raw.trim();
  if (g === '' || /not sure|rather not|n\/a|audit|incomplete|drop|withdrew/i.test(g)) return null;
  return g.toUpperCase();
}
