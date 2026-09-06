import clsx from "clsx";
import { POSITIVE_VIBE_TAGS, type VibeTag } from "@/lib/domain/types";
import { Chip } from "@/components/ui/Chip";
import { VIBE_TAG_LABELS } from "@/lib/copy/tooltips";

export interface VibeTagsProps {
  tags: readonly VibeTag[];
  /** Cap; default 3 (card). Pass Infinity on the detail page. */
  max?: number;
  /** Filter mode (detail page): chips become toggles. */
  selected?: readonly VibeTag[];
  onToggle?: (tag: VibeTag) => void;
  size?: "sm" | "md";
  className?: string;
}

/**
 * ≤ 3 lexicon-derived vibe tags (SPEC F18 / 8.9). Positive tags are tinted;
 * cautionary ones stay neutral so the row reads at a glance.
 */
export function VibeTags({ tags, max = 3, selected, onToggle, size = "sm", className }: VibeTagsProps) {
  const shown = tags.slice(0, max);
  if (shown.length === 0) return null;
  return (
    <ul aria-label="Vibe tags" className={clsx("flex flex-wrap items-center gap-1", className)}>
      {shown.map((tag) => {
        const positive = POSITIVE_VIBE_TAGS.has(tag);
        const label = VIBE_TAG_LABELS[tag];
        const tone = positive ? "brand" : "neutral";
        return (
          <li key={tag} className="inline-flex">
            {onToggle ? (
              <Chip tone={tone} size={size} onClick={() => onToggle(tag)} selected={selected?.includes(tag)}>
                {label}
              </Chip>
            ) : (
              <Chip tone={tone} size={size}>
                {label}
              </Chip>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default VibeTags;
