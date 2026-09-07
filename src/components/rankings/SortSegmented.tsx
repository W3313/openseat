"use client";

import type { SortKey } from "@/lib/domain/types";
import { Segmented } from "@/components/ui/Segmented";
import { StatTooltip } from "@/components/ui/StatTooltip";
import { SORT_LABELS, TOOLTIPS, sortKeysFor } from "@/lib/copy/tooltips";
import { SORT_KEYS } from "@/lib/utils/urlState";

export interface SortSegmentedProps {
  value: SortKey;
  onChange: (sort: SortKey) => void;
  /** Grades-only schools (design §5) hide rating / overall / reviews and offer the grade curve only. Default true. */
  reviewsAvailable?: boolean;
  className?: string;
}

/**
 * Rating | Overall | Grades | Reviews, each with a `StatTooltip` (SPEC F2). A grades-only school (design §5)
 * has a single sort, so the control renders nothing there — a one-option radiogroup cannot change anything;
 * the "Ranked by grade curve" pill in the header explains the order instead.
 */
export function SortSegmented({ value, onChange, reviewsAvailable = true, className }: SortSegmentedProps) {
  const keys = sortKeysFor(reviewsAvailable, SORT_KEYS);
  if (keys.length < 2) return null;
  const current: SortKey = keys.includes(value) ? value : keys[0];
  return (
    <Segmented<SortKey>
      label="Sort by"
      size="sm"
      value={current}
      onChange={onChange}
      className={className}
      options={keys.map((key) => ({
        value: key,
        label: SORT_LABELS[key],
        hint: (
          <StatTooltip
            label={`What does sorting by ${SORT_LABELS[key].toLowerCase()} mean?`}
            content={TOOLTIPS.sorts[key].text.replace("{ratingRaw}", "…").replace("{n}", "N")}
            placement="bottom"
          />
        ),
      }))}
    />
  );
}

export default SortSegmented;
