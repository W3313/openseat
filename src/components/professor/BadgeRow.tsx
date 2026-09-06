"use client";

import clsx from "clsx";
import type { BadgeId } from "@/lib/domain/types";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { Tooltip } from "@/components/ui/Tooltip";
import { BADGE_LABELS, badgeTooltip } from "@/lib/copy/tooltips";
import { MAX_BADGES_SHOWN } from "@/lib/domain/constants";

export interface BadgeRowProps {
  badges: readonly BadgeId[];
  /** Live mode: the open-now tooltip says "offered", not "open". Default true. */
  seatStatusAvailable?: boolean;
  /** Cap; default `MAX_BADGES_SHOWN` (3). */
  max?: number;
  size?: "sm" | "md";
  className?: string;
}

export const BADGE_TONES: Record<BadgeId, ChipTone> = {
  "open-now": "success",
  "tough-but-loved": "brand",
  "easy-a": "info",
  "hidden-gem": "warning",
  "low-withdrawal": "neutral",
};

/** Badge label with the live-mode wording for open-now. */
export function badgeLabel(id: BadgeId, seatStatusAvailable = true): string {
  if (id === "open-now" && !seatStatusAvailable) return "Offered now";
  return BADGE_LABELS[id];
}

/**
 * ≤ 3 badge chips (SPEC F9 / 8.11), each a focusable button carrying a
 * `Tooltip` with the plain-English rule from `tooltips.ts`.
 */
export function BadgeRow({ badges, seatStatusAvailable = true, max = MAX_BADGES_SHOWN, size = "sm", className }: BadgeRowProps) {
  const shown = badges.slice(0, max);
  if (shown.length === 0) return null;
  return (
    <ul aria-label="Badges" className={clsx("flex flex-wrap items-center gap-1", className)}>
      {shown.map((id) => (
        <li key={id} className="inline-flex">
          <Tooltip content={badgeTooltip(id, seatStatusAvailable)}>
            <Chip tone={BADGE_TONES[id]} size={size} onClick={() => {}} aria-label={`${badgeLabel(id, seatStatusAvailable)} badge`}>
              {badgeLabel(id, seatStatusAvailable)}
            </Chip>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}

export default BadgeRow;
