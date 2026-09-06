"use client";

import type { SortKey } from "@/lib/domain/types";
import { Segmented } from "@/components/ui/Segmented";
import { StatTooltip } from "@/components/ui/StatTooltip";
import { SORT_LABELS, TOOLTIPS } from "@/lib/copy/tooltips";
import { SORT_KEYS } from "@/lib/utils/urlState";

export interface SortSegmentedProps {
  value: SortKey;
  onChange: (sort: SortKey) => void;
  className?: string;
}

/** Rating | Overall | Grades | Reviews, each with a `StatTooltip` (SPEC F2). */
export function SortSegmented({ value, onChange, className }: SortSegmentedProps) {
  return (
    <Segmented<SortKey>
      label="Sort by"
      size="sm"
      value={value}
      onChange={onChange}
      className={className}
      options={SORT_KEYS.map((key) => ({
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
