import type { SectionStatus } from "@/lib/domain/types";
import { Chip, type ChipTone } from "@/components/ui/Chip";

export const STATUS_LABELS: Record<SectionStatus, string> = {
  open: "Open",
  waitlist: "Waitlist",
  closed: "Closed",
  offered: "Offered",
  inactive: "Inactive",
  unknown: "Unknown",
};

export const STATUS_TONES: Record<SectionStatus, ChipTone> = {
  open: "success",
  waitlist: "warning",
  closed: "danger",
  offered: "info",
  inactive: "neutral",
  unknown: "neutral",
};

/** Sort weight: open/offered first, then waitlist, closed, inactive, unknown (SPEC 3.2 item 5). */
export const STATUS_ORDER: Record<SectionStatus, number> = {
  open: 0,
  offered: 0,
  waitlist: 1,
  closed: 2,
  inactive: 3,
  unknown: 4,
};

export interface StatusChipProps {
  status: SectionStatus;
  size?: "sm" | "md";
  className?: string;
}

/** Section status pill; "Offered" carries the live-mode seat caveat as a native title. */
export function StatusChip({ status, size = "sm", className }: StatusChipProps) {
  const title = status === "offered" ? "Offered this term · seat availability not exposed by the public API" : undefined;
  return (
    <Chip tone={STATUS_TONES[status]} size={size} title={title} className={className}>
      {STATUS_LABELS[status]}
    </Chip>
  );
}

export default StatusChip;
