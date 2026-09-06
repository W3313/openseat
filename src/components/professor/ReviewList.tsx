"use client";

import { useEffect, useId, useMemo, useState } from "react";
import clsx from "clsx";
import type { Review, VibeTag } from "@/lib/domain/types";
import { VIBE_TAG_LABELS } from "@/lib/copy/tooltips";
import { pluralize } from "@/lib/utils/format";
import { Segmented } from "@/components/ui/Segmented";
import { VibeTags } from "./VibeTags";
import { ReviewCard } from "./ReviewCard";

export type ReviewTab = "positive" | "all";

export interface ReviewListProps {
  reviews: readonly Review[];
  /** Ids the AI summary cites; those cards are marked. */
  evidenceReviewIds?: readonly string[];
  defaultTab?: ReviewTab;
  className?: string;
}

/** Tags present on at least one review, most frequent first. */
export function availableTags(reviews: readonly Review[]): VibeTag[] {
  const counts = new Map<VibeTag, number>();
  for (const r of reviews) for (const t of r.vibeTags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

/** Tab + tag filter (every selected tag must be present). Order is preserved (date desc from the payload). */
export function filterReviews(reviews: readonly Review[], tab: ReviewTab, selected: readonly VibeTag[]): Review[] {
  return reviews.filter((r) => (tab === "all" || r.quality >= 4) && selected.every((t) => r.vibeTags.includes(t)));
}

/** Reviews with tabs Positive / All and vibe-tag filter chips (SPEC 3.4 item 7). */
export function ReviewList({ reviews, evidenceReviewIds = [], defaultTab = "positive", className }: ReviewListProps) {
  const [tab, setTab] = useState<ReviewTab>(defaultTab);
  const [selected, setSelected] = useState<VibeTag[]>([]);
  const headingId = useId();
  const tags = useMemo(() => availableTags(reviews), [reviews]);
  const positiveCount = reviews.filter((r) => r.quality >= 4).length;
  const shown = useMemo(() => filterReviews(reviews, tab, selected), [reviews, tab, selected]);
  const cited = new Set(evidenceReviewIds);

  // "Why this?" evidence links (#review-<id>) must resolve even when the target is hidden by the
  // Positive tab or a tag filter: widen the filter, then scroll the card into view.
  useEffect(() => {
    function reveal() {
      const hash = window.location.hash;
      if (!hash.startsWith("#review-")) return;
      const id = decodeURIComponent(hash.slice("#review-".length));
      const target = reviews.find((r) => r.id === id);
      if (!target) return;
      const visible = (tab === "all" || target.quality >= 4) && selected.every((t) => target.vibeTags.includes(t));
      if (!visible) {
        setTab("all");
        setSelected([]);
      }
      window.requestAnimationFrame(() => document.getElementById(`review-${id}`)?.scrollIntoView({ block: "start" }));
    }
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [reviews, tab, selected]);

  function toggleTag(tag: VibeTag) {
    setSelected((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  return (
    <section id="reviews" aria-labelledby={headingId} className={clsx("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="m-0 text-base font-semibold text-ink">
          Reviews <span className="font-normal text-ink-muted">({reviews.length})</span>
        </h2>
        <Segmented<ReviewTab>
          label="Show reviews"
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: "positive", label: `Positive (${positiveCount})` },
            { value: "all", label: `All (${reviews.length})` },
          ]}
        />
      </div>

      {tags.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-muted">Filter by vibe:</span>
          <VibeTags tags={tags} max={Infinity} selected={selected} onToggle={toggleTag} />
          {selected.length ? (
            <button type="button" onClick={() => setSelected([])} className="text-xs font-medium text-link hover:underline">
              Clear
            </button>
          ) : null}
        </div>
      ) : null}

      <p role="status" aria-live="polite" className="m-0 text-xs text-ink-faint">
        Showing {pluralize(shown.length, "review")}
        {selected.length ? ` tagged ${selected.map((t) => VIBE_TAG_LABELS[t]).join(" + ")}` : ""}
        {tab === "positive" ? " rated 4–5" : ""}.
      </p>

      {shown.length === 0 ? (
        <p className="m-0 rounded-card border border-dashed border-border p-4 text-sm text-ink-muted">
          {reviews.length === 0 ? "No reviews linked to this professor." : "No reviews match this filter."}
        </p>
      ) : (
        <ol aria-label="Reviews" className="m-0 flex list-none flex-col gap-2 p-0">
          {shown.map((r) => (
            <li key={r.id}>
              <ReviewCard review={r} cited={cited.has(r.id)} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default ReviewList;
