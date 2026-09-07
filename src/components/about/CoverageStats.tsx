import type { MatchMethod, MatchReport } from '@/lib/domain/types';
import { formatNumber, formatPct } from '@/lib/utils/format';

/** Methods that link a string to a professor, in the order they are displayed. */
export const LINKING_METHOD_ORDER: readonly MatchMethod[] = ['alias', 'exact', 'first-token', 'initial', 'nickname', 'compound-last', 'fuzzy'];

export interface CoverageItem {
  label: string;
  value: string;
  hint?: string;
}

type Coverage = MatchReport['coverage'];

/** Older match-report.json files predate `gradesOnly`; treat a missing count as 0. */
function gradesOnlyCount(coverage: Coverage): number {
  return coverage.gradesOnly ?? 0;
}

function sectionsItem(coverage: Coverage): CoverageItem {
  return {
    label: 'Sections linked',
    value: `${formatNumber(coverage.sectionsLinked)} / ${formatNumber(coverage.sectionsTotal)}`,
    hint: coverage.sectionsTotal > 0 ? `${formatPct((coverage.sectionsLinked / coverage.sectionsTotal) * 100, 1)} of staffed sections` : 'no schedule source',
  };
}

/**
 * The headline numbers of a MatchReport, pre-formatted (F21). With a review source the story is
 * "how many grade/schedule strings found their reviewed professor"; for a grades-only school every grade
 * string becomes its own professor, so the meaningful rate is schedule linkage (design §5).
 */
export function coverageItems(coverage: Coverage, reviewsAvailable = true): CoverageItem[] {
  const gradesOnly = gradesOnlyCount(coverage);
  if (!reviewsAvailable) {
    return [
      { label: 'Distinct instructor strings', value: formatNumber(coverage.distinctStrings), hint: 'grades + schedule, blocked strings excluded' },
      { label: 'Grade strings → grades-only professors', value: formatNumber(gradesOnly + coverage.ambiguous), hint: 'no review source to match against' },
      {
        label: 'Schedule strings linked',
        value: formatNumber(coverage.matched),
        hint: coverage.matchRate == null ? 'no schedule source' : `${formatPct(coverage.matchRate * 100, 1)} of staffed sections linked`,
      },
      { label: 'Schedule strings unmatched', value: formatNumber(coverage.unmatched), hint: 'no grade rows under that name' },
      { label: 'Blocked', value: formatNumber(coverage.blocked), hint: 'Staff / TBA / empty' },
      sectionsItem(coverage),
    ];
  }
  return [
    { label: 'Distinct instructor strings', value: formatNumber(coverage.distinctStrings), hint: 'grades + schedule, blocked strings excluded' },
    { label: 'Matched', value: formatNumber(coverage.matched), hint: coverage.matchRate == null ? undefined : `${formatPct(coverage.matchRate * 100, 1)} match rate` },
    { label: 'Ambiguous → grades-only', value: formatNumber(coverage.ambiguous), hint: 'never guessed' },
    { label: 'Unmatched → grades-only', value: formatNumber(coverage.unmatched + gradesOnly) },
    { label: 'Blocked', value: formatNumber(coverage.blocked), hint: 'Staff / TBA / empty' },
    sectionsItem(coverage),
  ];
}

/** The one-line coverage sentence ingest prints and the README quotes. */
export function coverageLine(coverage: Coverage, reviewsAvailable = true): string {
  const gradesOnly = gradesOnlyCount(coverage);
  const sections = `sections linked ${formatNumber(coverage.sectionsLinked)}/${formatNumber(coverage.sectionsTotal)}`;
  if (!reviewsAvailable) {
    const rate = coverage.matchRate == null ? 'no schedule' : formatPct(coverage.matchRate * 100, 1);
    return `${formatNumber(gradesOnly + coverage.ambiguous)} grade strings → grades-only professors · schedule strings linked ${formatNumber(coverage.matched)} (${sections}, ${rate}) · ${formatNumber(coverage.unmatched)} unmatched · ${formatNumber(coverage.blocked)} blocked`;
  }
  const rate = coverage.matchRate == null ? '—' : formatPct(coverage.matchRate * 100, 1);
  return `matched ${formatNumber(coverage.matched)}/${formatNumber(coverage.distinctStrings)} instructor strings (${rate}) · ${formatNumber(coverage.ambiguous)} ambiguous · ${formatNumber(coverage.unmatched + gradesOnly)} unmatched · ${formatNumber(coverage.blocked)} blocked · ${sections}`;
}

export interface CoverageStatsProps {
  report: Pick<MatchReport, 'coverage' | 'generatedAt'>;
  schoolId?: string;
  /** false → grades-only wording (schedule linkage instead of a grade-string match rate). Default true. */
  reviewsAvailable?: boolean;
  className?: string;
}

/** SPEC 3.6 / F21 `CoverageStats`: totals plus a per-method breakdown from match-report.json. */
export function CoverageStats({ report, schoolId = 'uiuc', reviewsAvailable = true, className }: CoverageStatsProps) {
  const { coverage } = report;
  const methodsWithHits = LINKING_METHOD_ORDER.filter((m) => (coverage.byMethod[m] ?? 0) > 0);
  const denominator = Math.max(1, coverage.matched);
  return (
    <div className={className}>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {coverageItems(coverage, reviewsAvailable).map((item) => (
          <div key={item.label} className="rounded-lg border border-border bg-surface-raised px-3 py-2">
            <dt className="text-xs text-ink-faint">{item.label}</dt>
            <dd className="text-lg font-semibold tabular-nums text-ink">{item.value}</dd>
            {item.hint ? <dd className="text-xs text-ink-muted">{item.hint}</dd> : null}
          </div>
        ))}
      </dl>
      <div className="mt-3">
        <h3 className="text-sm font-semibold text-ink">{reviewsAvailable ? 'Matched strings by method' : 'Schedule strings linked by method'}</h3>
        {methodsWithHits.length === 0 ? (
          <p className="text-sm text-ink-muted">No linked strings in this dataset.</p>
        ) : (
          <ul className="mt-2 space-y-1.5" aria-label="Matched strings by method">
            {methodsWithHits.map((m) => {
              const n = coverage.byMethod[m] ?? 0;
              const pct = (n / denominator) * 100;
              return (
                <li key={m} className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-ink">{m}</span>
                  <span className="h-2 overflow-hidden rounded bg-surface-sunken" aria-hidden="true">
                    <span className="block h-full rounded bg-brand" style={{ width: `${Math.max(2, pct)}%` }} />
                  </span>
                  <span className="text-right tabular-nums text-ink-muted">{formatNumber(n)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="mt-3 text-xs text-ink-faint">
        Report generated {report.generatedAt}. Download the raw file:{' '}
        <a href={`/api/schools/${encodeURIComponent(schoolId)}/match-report`} className="text-link underline underline-offset-2">
          /api/schools/{schoolId}/match-report
        </a>
        .
      </p>
    </div>
  );
}

export default CoverageStats;
