'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import type { MatchMethod, MatchReportEntry } from '@/lib/domain/types';
import { buildProfessorHref } from '@/lib/utils/urlState';
import { formatNumber } from '@/lib/utils/format';

export const REPORT_METHODS: readonly MatchMethod[] = [
  'alias', 'exact', 'first-token', 'initial', 'nickname', 'compound-last', 'fuzzy', 'ambiguous', 'unmatched', 'blocked', 'grades-only',
];
export type SourceFilter = 'all' | 'grades' | 'schedule';
export type MethodFilter = 'all' | MatchMethod;

export interface ProfessorRef { slug: string; displayName: string }

export interface MatchReportFilters {
  method: MethodFilter;
  source: SourceFilter;
  text: string;
}

/** Pure filter used by the table (exported for tests): method, source and a case-insensitive substring. */
export function filterEntries(entries: readonly MatchReportEntry[], f: MatchReportFilters): MatchReportEntry[] {
  const needle = f.text.trim().toLowerCase();
  return entries.filter((e) => {
    if (f.method !== 'all' && e.method !== f.method) return false;
    if (f.source !== 'all' && e.source !== f.source) return false;
    if (needle && !`${e.instructorRaw} ${e.subjects.join(' ')} ${e.professorId ?? ''}`.toLowerCase().includes(needle)) return false;
    return true;
  });
}

const PAGE = 100;

export interface MatchReportTableProps {
  entries: readonly MatchReportEntry[];
  /** professorId → link target and name; unknown ids render as the raw id. */
  professors?: Readonly<Record<string, ProfessorRef>>;
  schoolId?: string;
  className?: string;
}

/** SPEC 3.6 / F21 `MatchReportTable`: every distinct (source, raw string) with filters by method and source. */
export function MatchReportTable({ entries, professors = {}, schoolId = 'uiuc', className }: MatchReportTableProps) {
  const id = useId();
  const [method, setMethod] = useState<MethodFilter>('all');
  const [source, setSource] = useState<SourceFilter>('all');
  const [text, setText] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => filterEntries(entries, { method, source, text }), [entries, method, source, text]);
  const shown = filtered.slice(0, limit);

  return (
    <div className={className}>
      <form className="mb-3 flex flex-wrap items-end gap-3" onSubmit={(e) => e.preventDefault()} aria-label="Filter match report">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          Method
          <select
            id={`${id}-method`}
            value={method}
            onChange={(e) => { setMethod(e.target.value as MethodFilter); setLimit(PAGE); }}
            className="h-9 rounded-md border border-border-strong bg-surface-raised px-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <option value="all">All methods</option>
            {REPORT_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
          Source
          <select
            id={`${id}-source`}
            value={source}
            onChange={(e) => { setSource(e.target.value as SourceFilter); setLimit(PAGE); }}
            className="h-9 rounded-md border border-border-strong bg-surface-raised px-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <option value="all">Grades + schedule</option>
            <option value="grades">Grades (CSV)</option>
            <option value="schedule">Schedule</option>
          </select>
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-ink-muted">
          Search raw string
          <input
            id={`${id}-text`}
            type="search"
            value={text}
            onChange={(e) => { setText(e.target.value); setLimit(PAGE); }}
            placeholder='e.g. "Okonkwo"'
            className="h-9 rounded-md border border-border-strong bg-surface-raised px-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          />
        </label>
        <p className="text-sm tabular-nums text-ink-muted" role="status" aria-live="polite">
          {formatNumber(filtered.length)} of {formatNumber(entries.length)} strings
        </p>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
          <caption className="sr-only">Match report: every distinct instructor string, how it was resolved, and to whom</caption>
          <thead className="bg-surface-sunken text-xs uppercase tracking-wide text-ink-faint">
            <tr>
              <th scope="col" className="px-3 py-2">Raw string</th>
              <th scope="col" className="px-3 py-2">Source</th>
              <th scope="col" className="px-3 py-2">Subjects</th>
              <th scope="col" className="px-3 py-2">Method</th>
              <th scope="col" className="px-3 py-2 text-right">Score</th>
              <th scope="col" className="px-3 py-2 text-right">Rows</th>
              <th scope="col" className="px-3 py-2">Linked to</th>
              <th scope="col" className="px-3 py-2">Runners-up</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-ink-muted">No strings match these filters.</td>
              </tr>
            ) : (
              shown.map((e) => {
                const ref = e.professorId ? professors[e.professorId] : undefined;
                const runnersUp = e.candidates.filter((c) => c.professorId !== e.professorId).slice(0, 2);
                return (
                  <tr key={`${e.source}|${e.method}|${e.professorId ?? ''}|${e.instructorRaw}`} className="border-t border-border align-top">
                    <td className="px-3 py-1.5 font-mono text-xs text-ink">&quot;{e.instructorRaw}&quot;</td>
                    <td className="px-3 py-1.5 text-ink-muted">{e.source}</td>
                    <td className="px-3 py-1.5 text-ink-muted">{e.subjects.join(', ')}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-ink">{e.method}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-ink-muted">{e.score.toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-ink-muted">{formatNumber(e.rows)}</td>
                    <td className="px-3 py-1.5">
                      {e.professorId === null ? (
                        <span className="text-ink-faint">—</span>
                      ) : ref ? (
                        <Link href={buildProfessorHref(schoolId, ref.slug)} className="text-link underline underline-offset-2">
                          {ref.displayName}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-ink-muted">{e.professorId}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-ink-faint">
                      {runnersUp.length === 0
                        ? ''
                        : runnersUp.map((c) => `${professors[c.professorId]?.displayName ?? c.professorId} (${c.score.toFixed(2)})`).join(', ')}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > shown.length ? (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE)}
          className="mt-3 h-9 rounded-md border border-border-strong bg-surface-raised px-3 text-sm font-medium text-ink hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Show {formatNumber(Math.min(PAGE, filtered.length - shown.length))} more
        </button>
      ) : null}
    </div>
  );
}

export default MatchReportTable;
