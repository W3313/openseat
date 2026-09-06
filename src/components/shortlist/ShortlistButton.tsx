"use client";

import { useEffect, type MouseEvent } from "react";
import clsx from "clsx";
import { Bookmark, BookmarkCheck } from "lucide-react";
import type { Professor } from "@/lib/domain/types";
import { useToast } from "@/components/ui/Toast";
import { useShortlist } from "./useShortlist";

export interface ShortlistButtonProps {
  professor: Pick<Professor, "slug" | "schoolId" | "displayName"> & Partial<Pick<Professor, "subjects">>;
  /** "icon" (card title row) or "labeled" (detail header). */
  variant?: "icon" | "labeled";
  className?: string;
}

/**
 * Add/remove a professor from "My picks" (SPEC F16). Rendered inside a `<summary>` on cards, so the
 * click must not bubble into the details toggle. `aria-pressed` reflects membership.
 */
export function ShortlistButton({ professor, variant = "icon", className }: ShortlistButtonProps) {
  const shortlist = useShortlist();
  const { toast } = useToast();
  const picked = shortlist.isPicked(professor.schoolId, professor.slug);
  const full = !picked && shortlist.isFull(professor.schoolId);
  const subject = professor.subjects?.[0];

  // Backfill the display name for picks that arrived through a share URL (slug only).
  useEffect(() => {
    if (!shortlist.ready || !picked) return;
    const stored = shortlist.picksFor(professor.schoolId).find((p) => p.slug === professor.slug);
    if (stored && !stored.displayName) {
      shortlist.add({ slug: professor.slug, schoolId: professor.schoolId, displayName: professor.displayName, subject });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when readiness/membership changes only
  }, [shortlist.ready, picked]);

  function onClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault(); // inside <summary>: do not toggle the card
    e.stopPropagation();
    const result = shortlist.toggle({ slug: professor.slug, schoolId: professor.schoolId, displayName: professor.displayName, subject });
    if (result === null) {
      toast(`My picks holds ${shortlist.max} professors — remove one to add another`, { tone: "neutral" });
      return;
    }
    toast(result ? `Added ${professor.displayName} to My picks` : `Removed ${professor.displayName} from My picks`, {
      tone: result ? "success" : "neutral",
    });
  }

  const label = picked ? `Remove ${professor.displayName} from My picks` : `Add ${professor.displayName} to My picks`;
  const Icon = picked ? BookmarkCheck : Bookmark;

  if (variant === "labeled") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={picked}
        aria-label={label}
        disabled={!shortlist.ready}
        title={full ? `My picks is full (${shortlist.max})` : undefined}
        className={clsx(
          "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors",
          picked
            ? "border-transparent bg-brand-soft text-brand hover:brightness-95 dark:hover:brightness-110"
            : "border-border-strong bg-surface-raised text-ink hover:bg-surface-sunken",
          "disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
      >
        <Icon aria-hidden="true" className="h-4 w-4" />
        {picked ? "In My picks" : "Add to My picks"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={picked}
      aria-label={label}
      disabled={!shortlist.ready}
      title={full ? `My picks is full (${shortlist.max})` : picked ? "In My picks" : "Add to My picks"}
      className={clsx(
        "inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors",
        picked ? "text-brand hover:bg-brand-soft" : "text-ink-faint hover:bg-surface-sunken hover:text-ink",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  );
}

export default ShortlistButton;
