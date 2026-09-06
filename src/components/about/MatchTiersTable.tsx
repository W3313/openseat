import type { MatchMethod } from '@/lib/domain/types';
import { MATCH_ACCEPT, MATCH_ACCEPT_SCHOOL_WIDE, MATCH_MARGIN } from '@/lib/domain/constants';
import { MIDDLE_INITIAL_PENALTY, NICKNAME_GROUP_COUNT, TIER_SCORES } from '@/lib/matching';

export interface MatchTier {
  tier: string;
  method: MatchMethod;
  condition: string;
  example: string;
  score: number;
}

/** SPEC 7.3 tier table; scores come from the matching module so the page can never drift from the code. */
export const MATCH_TIERS: readonly MatchTier[] = [
  {
    tier: 'T0',
    method: 'alias',
    condition: 'data/overrides/<school>-instructor-aliases.json maps the exact raw string to a professor id (applied before scoring).',
    example: '"Vantreight, C" → cordelia-vantreight',
    score: TIER_SCORES.alias,
  },
  {
    tier: 'T1',
    method: 'exact',
    condition: 'Same compact surname AND the same full first name (hyphens, periods, diacritics and suffixes ignored).',
    example: '"Garcia-Ramirez, Maria" ↔ Maria Garcia Ramirez',
    score: TIER_SCORES.exact,
  },
  {
    tier: 'T2',
    method: 'first-token',
    condition: 'Same surname AND the same first token, both at least two letters (a middle initial may differ).',
    example: '"Lee, Jane Marie" ↔ Jane Lee',
    score: TIER_SCORES['first-token'],
  },
  {
    tier: 'T3',
    method: 'initial',
    condition: 'Same surname AND one side is a bare initial that agrees with the other side’s first letter.',
    example: '"Okonkwo, A" ↔ Adaeze Okonkwo',
    score: TIER_SCORES.initial,
  },
  {
    tier: 'T4',
    method: 'nickname',
    condition: `Same surname AND the first names sit in the same nickname group (${NICKNAME_GROUP_COUNT} groups, e.g. william/bill/will/billy).`,
    example: '"Vantreight, Bill" ↔ William Vantreight',
    score: TIER_SCORES.nickname,
  },
  {
    tier: 'T5',
    method: 'compound-last',
    condition: 'Surnames differ but share the final token, or one is a prefix/suffix of the other (shorter ≥ 4 letters); first names must satisfy T1 or T2.',
    example: '"Ramirez, Maria" ↔ Maria Garcia Ramirez',
    score: TIER_SCORES['compound-last'],
  },
  {
    tier: 'T6',
    method: 'fuzzy',
    condition: 'Surnames are one edit apart (incl. a transposition), both ≥ 6 letters; first names must satisfy T1 or T2.',
    example: '"Stienberg, Eli" ↔ Eli Steinberg',
    score: TIER_SCORES.fuzzy,
  },
];

/** SPEC 3.6 `#matching`: the Section 7.3 tier table plus the acceptance rules. */
export function MatchTiersTable({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
          <caption className="sr-only">Name-matching tiers, evaluated top to bottom; the first hit wins</caption>
          <thead className="bg-surface-sunken text-xs uppercase tracking-wide text-ink-faint">
            <tr>
              <th scope="col" className="px-3 py-2">Tier</th>
              <th scope="col" className="px-3 py-2">Method</th>
              <th scope="col" className="px-3 py-2">Condition</th>
              <th scope="col" className="px-3 py-2">Example</th>
              <th scope="col" className="px-3 py-2 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {MATCH_TIERS.map((t) => (
              <tr key={t.tier} className="border-t border-border align-top">
                <td className="px-3 py-2 font-mono text-xs text-ink-faint">{t.tier}</td>
                <th scope="row" className="px-3 py-2 font-mono text-xs font-medium text-ink">
                  {t.method}
                </th>
                <td className="px-3 py-2 text-ink-muted">{t.condition}</td>
                <td className="px-3 py-2 font-mono text-xs text-ink">{t.example}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{t.score.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 list-disc space-y-1 pl-5">
        <li>
          <strong>Middle-initial penalty:</strong> when both sides carry a middle initial and they differ, the score is
          multiplied by {MIDDLE_INITIAL_PENALTY} (so <code>&quot;Smith, J A&quot;</code> does not attach to John B Smith).
        </li>
        <li>
          <strong>Last-name-only strings</strong> (<code>&quot;Patel&quot;</code>) never match and become a grades-only entry.
        </li>
        <li>
          <strong>Acceptance:</strong> within a scope the best candidate must score at least {MATCH_ACCEPT} (subject or course
          scope) or {MATCH_ACCEPT_SCHOOL_WIDE} (school-wide) <em>and</em> beat the runner-up by at least {MATCH_MARGIN}. A
          scope that produces an ambiguity stops the search: an ambiguous match is <em>no</em> match.
        </li>
        <li>
          <strong>Scopes:</strong> grade strings try subject → school; schedule strings try course → subject → school.
        </li>
      </ul>
    </div>
  );
}

export default MatchTiersTable;
