import type { MatchMethod, MatchReport } from '@/lib/domain/types';
import { formatNumber, formatPct } from '@/lib/utils/format';

/** Methods that link a string to a professor, in the order they are displayed. */
export const LINKING_METHOD_ORDER: readonly MatchMethod[] = ['alias', 'exact', 'first-token', 'initial', 'nickname', 'compound-last', 'fuzzy'];

export interface CoverageItem {
  label: string;
  value: string;
  hint?: string;
}

/** The headline numbers of a MatchReport, pre-formatted (F21). */
export function coverageItems(coverage: MatchReport['coverage']): CoverageItem[] {
  return [
    { label: 'Distinct instructor strings', value: formatNumber(coverage.distinctStrings), hint: 'grades + schedule, blocked strings excluded' },
    { label: 'Matched', value: formatNumber(coverage.matched), hint: `${formatPct(coverage.matchRate * 100, 1)} match rate` },
    { label: 'Ambiguous → grades-only', value: formatNumber(coverage.ambiguous), hint: 'never guessed' },
    { label: 'Unmatched → grades-only', value: formatNumber(coverage.unmatched) },
    { label: 'Blocked', value: formatNumber(coverage.blocked), hint: 'Staff / TBA / empty' },
    {
      label: 'Sections linked',
      value: `${formatNumber(coverage.sectionsLinked)} / ${formatNumber(coverage.sectionsTotal)}`,
      hint: coverage.sectionsTotal > 0 ? formatPct((coverage.sectionsLinked / coverage.sectionsTotal) * 100, 1) : undefined,
    },
  ];
}

/** The one-line coverage sentence ingest prints and the README quotes. */
export function coverageLine(coverage: MatchReport['coverage']): string {
  return `matched ${formatNumber(coverage.matched)}/${formatNumber(coverage.distinctStrings)} instructor strings (${formatPct(coverage.matchRate * 100, 1)}) · ${formatNumber(coverage.ambiguous)} ambiguous · ${formatNumber(coverage.unmatched)} unmatched · ${formatNumber(coverage.blocked)} blocked · sections linked ${formatNumber(coverage.sectionsLinked)}/${formatNumber(coverage.sectionsTotal)}`;
}

export interface CoverageStatsProps {
  report: Pick<MatchReport, 'coverage' | 'generatedAt'>;
  schoolId?: string;
  className?: string;
}

/** SPEC 3.6 / F21 `CoverageStats`: totals plus a per-method breakdown from match-report.json. */
export function CoverageStats({ report, schoolId = 'uiuc', className }: CoverageStatsProps) {
  const { coverage } = report;
  const methodsWithHits = LINKING_METHOD_ORDER.filter((m) => (coverage.byMethod[m] ?? 0) > 0);
  const denominator = Math.max(1, coverage.matched);
  return (
    <div className={className}>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {coverageItems(coverage).map((item) => (
          <div key={item.label} className="rounded-lg border border-border bg-surface-raised px-3 py-2">
            <dt className="text-xs text-ink-faint">{item.label}</dt>
            <dd className="text-lg font-semibold tabular-nums text-ink">{item.value}</dd>
            {item.hint ? <dd className="text-xs text-ink-muted">{item.hint}</dd> : null}
          </div>
        ))}
      </dl>
      <div className="mt-3">
        <h3 className="text-sm font-semibold text-ink">Matched strings by method</h3>
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
