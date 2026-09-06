import type { BadgeId } from '@/lib/domain/types';
import { MAX_BADGES_SHOWN, MIN_BADGE_N } from '@/lib/domain/constants';
import { BADGE_ORDER, BADGE_THRESHOLDS } from '@/lib/scoring/badges';
import { BADGE_LABELS, OPEN_NOW_LIVE_TEXT, badgeTooltip } from '@/lib/copy/tooltips';

/** The rule behind each badge, printed from the same constants badges.ts evaluates (SPEC 8.11). */
export const BADGE_RULES: Record<BadgeId, string> = {
  'open-now': 'openSections.length ≥ 1',
  'tough-but-loved': `gpaDelta ≤ ${BADGE_THRESHOLDS.toughDeltaMax} AND ratingShrunk ≥ ${BADGE_THRESHOLDS.toughRatingMin} AND deltaComparableN ≥ ${MIN_BADGE_N}`,
  'easy-a': `gpaDelta ≥ +${BADGE_THRESHOLDS.easyDeltaMin} AND deltaComparableN ≥ ${MIN_BADGE_N}`,
  'hidden-gem': `ratingRaw ≥ ${BADGE_THRESHOLDS.gemRatingRawMin} AND ${BADGE_THRESHOLDS.gemReviewsMin} ≤ reviewCount ≤ ${BADGE_THRESHOLDS.gemReviewsMax}`,
  'low-withdrawal': `wRate ≤ ${BADGE_THRESHOLDS.lowWithdrawalRatio} × subjectWRate AND studentsGraded + withdrawn ≥ ${MIN_BADGE_N} AND subjectWRate ≥ ${BADGE_THRESHOLDS.lowWithdrawalSubjectMin}`,
};

export interface BadgeLegendProps {
  /** Demo: true (seat states known). Live Course Explorer: false → open-now reads "offered". */
  seatStatusAvailable?: boolean;
  className?: string;
}

/** SPEC 3.6 `#badges`: every badge in evaluation order with its plain-English tooltip and its rule. */
export function BadgeLegend({ seatStatusAvailable = true, className }: BadgeLegendProps) {
  return (
    <div className={className}>
      <p>
        Badges are evaluated in the order below and the first {MAX_BADGES_SHOWN} that hold are shown on a card. They only
        see the aggregates, which already exclude suppressed rows, so a badge is never earned from a 6-student
        section.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <caption className="sr-only">Badge legend: label, meaning and rule for each badge</caption>
          <thead className="bg-surface-sunken text-xs uppercase tracking-wide text-ink-faint">
            <tr>
              <th scope="col" className="px-3 py-2">#</th>
              <th scope="col" className="px-3 py-2">Badge</th>
              <th scope="col" className="px-3 py-2">What it means</th>
              <th scope="col" className="px-3 py-2">Rule</th>
            </tr>
          </thead>
          <tbody>
            {BADGE_ORDER.map((id, i) => (
              <tr key={id} className="border-t border-border align-top">
                <td className="px-3 py-2 tabular-nums text-ink-faint">{i + 1}</td>
                <th scope="row" className="px-3 py-2 font-medium text-ink">
                  {BADGE_LABELS[id]}
                </th>
                <td className="px-3 py-2 text-ink-muted">
                  {badgeTooltip(id, seatStatusAvailable)}
                  {id === 'open-now' && seatStatusAvailable ? (
                    <span className="block text-xs text-ink-faint">Live mode: “{OPEN_NOW_LIVE_TEXT}”</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-ink">{BADGE_RULES[id]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default BadgeLegend;
