"use client";

import { Toggle } from "@/components/ui/Toggle";
import { StatTooltip } from "@/components/ui/StatTooltip";
import { TOOLTIPS } from "@/lib/copy/tooltips";
import { openToggleLabel } from "@/lib/config/schools";

export interface OpenOnlyToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  seatStatusAvailable: boolean;
  className?: string;
}

/** "Open seats only" (demo) / "Offered this term" (live) — SPEC F3. */
export function OpenOnlyToggle({ checked, onChange, seatStatusAvailable, className }: OpenOnlyToggleProps) {
  const entry = seatStatusAvailable ? TOOLTIPS.stats.openSections : TOOLTIPS.stats.offeredSections;
  return (
    <Toggle
      label={openToggleLabel({ seatStatusAvailable })}
      checked={checked}
      onChange={onChange}
      className={className}
      hint={<StatTooltip label={`What does "${openToggleLabel({ seatStatusAvailable })}" mean?`} content={entry.text} placement="bottom" />}
    />
  );
}

export default OpenOnlyToggle;
