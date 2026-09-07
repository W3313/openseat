import type { DataMode, GradeBucketKind, GradeValueKind, MetaCounts } from '@/lib/domain/types';
import type { SchoolAttribution } from '@/components/layout/schoolFlags';
import { formatNumber } from '@/lib/utils/format';

/** One row of the per-school sources table (design §8 / §2 `attribution`), assembled by /about from the registry + meta.json. */
export interface SchoolsTableRow {
  id: string;
  name: string;
  shortName: string;
  mode: DataMode;
  reviewsAvailable: boolean;
  seatStatusAvailable: boolean;
  gradeValueKind: GradeValueKind;
  gradeBuckets: GradeBucketKind;
  attribution: SchoolAttribution;
  /** Adapter ids from the registry (`sources.<x>.kind`), for the fine print. */
  adapters: { grades: string; schedule: string | null; reviews: string | null };
  /** Subject allowlist size, or null for "all". */
  subjectCount: number | null;
  counts: MetaCounts | null;
  builtAt: string | null;
  /** Source licences recorded by the adapters in meta.json (`SourceInfo.license`), null when none declared. */
  licenses: { label: string; license: string | null; url: string | null }[];
  /** `Meta.excludedGradeCodes` — row counts inside the grade window (design §4/§4.1). */
  excludedGradeCodes?: Record<string, number>;
  /** `Meta.droppedRows` — in-window source rows without a letter grade (or duplicate rows). */
  droppedRows?: number;
}

export const BUCKET_LABELS: Record<GradeBucketKind, string> = {
  'plus-minus': 'A+ … D−, F, W',
  'letter-with-w': 'A … F, W (no +/−)',
  'letter-only': 'A … F (no +/−, no W)',
};

export const VALUE_KIND_LABELS: Record<GradeValueKind, string> = {
  counts: 'student counts',
  percent: 'percentages per section (counted as sections)',
};

/** "none — official grade data only" | "fictional demo reviews" */
export function reviewsCell(row: Pick<SchoolsTableRow, 'mode' | 'reviewsAvailable'>): string {
  if (row.mode === 'demo') return 'fictional demo reviews';
  return row.reviewsAvailable ? 'first-party reviews' : 'none — official grade data only';
}

/** "25 subjects · 1,204 professors · 6,910 grade rows" (whatever is known). */
export function datasetCell(row: Pick<SchoolsTableRow, 'subjectCount' | 'counts'>): string {
  const parts: string[] = [];
  parts.push(row.subjectCount == null ? 'all subjects' : `${formatNumber(row.subjectCount)} subjects`);
  if (row.counts) {
    parts.push(`${formatNumber(row.counts.professors)} professors`);
    parts.push(`${formatNumber(row.counts.gradeRows)} grade rows`);
    parts.push(`${formatNumber(row.counts.sections)} sections`);
  } else {
    parts.push('not built yet');
  }
  return parts.join(' · ');
}

function stamp(iso: string | null, timezone: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone, dateStyle: 'medium' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export interface SchoolsTableProps {
  rows: readonly SchoolsTableRow[];
  timezone?: string;
  className?: string;
}

/** SPEC 3.6 `#sources`, per school (design §8): what each school's grades, schedule and reviews come from. */
export function SchoolsTable({ rows, timezone = 'America/Chicago', className }: SchoolsTableProps) {
  return (
    <div className={className}>
      {/* Focusable, labelled scroll region so keyboard users can reach the off-screen columns (axe scrollable-region-focusable). */}
      <div
        role="region"
        tabIndex={0}
        aria-labelledby="schools-table-caption"
        className="overflow-x-auto rounded-lg border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <table className="w-full min-w-[56rem] border-collapse text-left text-sm" data-testid="schools-table">
          <caption id="schools-table-caption" className="sr-only">Data sources for every school in this build</caption>
          <thead className="bg-surface-sunken text-xs uppercase tracking-wide text-ink-faint">
            <tr>
              <th scope="col" className="px-3 py-2">School</th>
              <th scope="col" className="px-3 py-2">Grades</th>
              <th scope="col" className="px-3 py-2">Schedule</th>
              <th scope="col" className="px-3 py-2">Reviews</th>
              <th scope="col" className="px-3 py-2">Dataset</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border align-top" data-school={row.id}>
                <th scope="row" className="px-3 py-2 font-medium text-ink">
                  {row.name}
                  <span className="block font-mono text-[0.7rem] font-normal text-ink-faint">
                    {row.id} · {row.mode}
                  </span>
                </th>
                <td className="px-3 py-2 text-ink-muted">
                  {row.attribution.grades}
                  <span className="block text-xs text-ink-faint">
                    {BUCKET_LABELS[row.gradeBuckets]} · {VALUE_KIND_LABELS[row.gradeValueKind]} · <code>{row.adapters.grades}</code>
                  </span>
                  {row.excludedGradeCodes && Object.keys(row.excludedGradeCodes).length ? (
                    <span
                      className="block text-xs text-ink-faint"
                      title="Rows in the grade window (every subject in the file) where the code appeared; such grades never enter the GPA. Dropped rows carried no letter grade at all (or repeated another row)."
                    >
                      excluded codes (rows in window):{' '}
                      {Object.entries(row.excludedGradeCodes).map(([code, n]) => `${code} ${formatNumber(n)}`).join(' · ')}
                      {row.droppedRows ? ` · ${formatNumber(row.droppedRows)} rows dropped` : ''}
                    </span>
                  ) : null}
                  {row.licenses.length ? (
                    <span className="block text-xs text-ink-faint">
                      {row.licenses.map((l, i) => (
                        <span key={`${l.label}-${i}`}>
                          {i > 0 ? ' · ' : ''}
                          {l.url ? (
                            <a href={l.url} rel="noopener noreferrer" target="_blank">
                              {l.label}
                              <span className="sr-only"> (opens in a new tab)</span>
                            </a>
                          ) : (
                            l.label
                          )}
                          : {l.license ?? 'no licence declared'}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-ink-muted">
                  {row.attribution.schedule ?? 'none — grades only'}
                  {row.adapters.schedule ? (
                    <span className="block text-xs text-ink-faint">
                      {row.seatStatusAvailable ? 'seat availability exposed' : 'no seat availability (“offered”, not “open”)'} · <code>{row.adapters.schedule}</code>
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-ink-muted">{reviewsCell(row)}</td>
                <td className="px-3 py-2 text-ink-muted">
                  {datasetCell(row)}
                  <span className="block text-xs text-ink-faint">built {stamp(row.builtAt, timezone)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default SchoolsTable;
