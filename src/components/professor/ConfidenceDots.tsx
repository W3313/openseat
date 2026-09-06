import clsx from "clsx";
import type { ConfidenceLabel } from "@/lib/domain/types";

export const CONFIDENCE_DOTS: Record<ConfidenceLabel, number> = { low: 1, medium: 2, high: 3 };

export interface ConfidenceDotsProps {
  confidence: ConfidenceLabel;
  className?: string;
}

/** "Confidence: medium (2 of 3)" */
export function confidenceAriaLabel(confidence: ConfidenceLabel): string {
  return `Confidence: ${confidence} (${CONFIDENCE_DOTS[confidence]} of 3)`;
}

/**
 * 1–3 filled dots from `ProfessorScores.confidence` (SPEC F8 / 8.4). Purely
 * visual; the accessible name carries the label so the dots are never the only
 * cue.
 */
export function ConfidenceDots({ confidence, className }: ConfidenceDotsProps) {
  const filled = CONFIDENCE_DOTS[confidence];
  return (
    <span
      role="img"
      aria-label={confidenceAriaLabel(confidence)}
      className={clsx("inline-flex items-center gap-0.5", className)}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className={clsx(
            "inline-block h-1.5 w-1.5 rounded-full",
            i < filled ? "bg-brand" : "border border-border-strong bg-transparent",
          )}
        />
      ))}
    </span>
  );
}

export default ConfidenceDots;
