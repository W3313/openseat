// SPEC 7.4 step 6 — match-report rows and coverage totals for data/processed/<school>/match-report.json.
import type { MatchMethod, MatchReport, MatchReportEntry } from '@/lib/domain/types';
import type { MatchSource, Resolution } from './types';

export const MATCH_METHODS: readonly MatchMethod[] = [
  'alias', 'exact', 'first-token', 'initial', 'nickname', 'compound-last', 'fuzzy', 'ambiguous', 'unmatched', 'blocked',
];

export const LINKING_METHODS: ReadonlySet<MatchMethod> = new Set<MatchMethod>([
  'alias', 'exact', 'first-token', 'initial', 'nickname', 'compound-last', 'fuzzy',
]);

/** One report row for a distinct (source, instructorRaw). `rows` = grade rows or sections carrying the string. */
export function toReportEntry(
  instructorRaw: string,
  source: MatchSource,
  subject: string,
  resolution: Resolution,
  rows: number,
): MatchReportEntry {
  return {
    instructorRaw,
    source,
    subject,
    method: resolution.method,
    score: resolution.score,
    professorId: resolution.professorId,
    rows,
    candidates: resolution.candidates.slice(0, 3).map((c) => ({ ...c })),
  };
}

export interface BuildMatchReportInput {
  /** Every distinct (source, instructorRaw) that was not blocked (blocked strings are never reported). */
  entries: readonly MatchReportEntry[];
  /** Count of distinct blocked strings (Staff/TBA/'') — reported in coverage only. */
  blockedCount?: number;
  sectionsLinked: number;
  sectionsTotal: number;
  generatedAt?: string;
}

/** Stable order for the report: source, then subject, then raw string. */
export function sortReportEntries(entries: readonly MatchReportEntry[]): MatchReportEntry[] {
  return [...entries].sort(
    (a, b) => cmp(a.source, b.source) || cmp(a.subject, b.subject) || cmp(a.instructorRaw, b.instructorRaw),
  );
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Aggregate coverage over the entries; matchRate = matched / distinct non-blocked strings (0 when none). */
export function buildMatchReport(input: BuildMatchReportInput): MatchReport {
  const byMethod = Object.fromEntries(MATCH_METHODS.map((m) => [m, 0])) as Record<MatchMethod, number>;
  let matched = 0;
  let ambiguous = 0;
  let unmatched = 0;
  const entries = sortReportEntries(input.entries.filter((e) => e.method !== 'blocked'));
  for (const e of entries) {
    byMethod[e.method] += 1;
    if (e.method === 'ambiguous') ambiguous += 1;
    else if (e.method === 'unmatched') unmatched += 1;
    else if (LINKING_METHODS.has(e.method) && e.professorId !== null) matched += 1;
  }
  const blocked = input.blockedCount ?? 0;
  byMethod.blocked = blocked;
  const distinctStrings = entries.length;
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    coverage: {
      distinctStrings,
      matched,
      ambiguous,
      unmatched,
      blocked,
      byMethod,
      sectionsLinked: input.sectionsLinked,
      sectionsTotal: input.sectionsTotal,
      matchRate: distinctStrings === 0 ? 0 : matched / distinctStrings,
    },
    entries,
  };
}
