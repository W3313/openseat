"use client";

import Link from "next/link";
import { useState, type SyntheticEvent } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import type { RankedProfessor } from "@/lib/domain/types";
import { POSITIVE_PREVIEW_SHOWN } from "@/lib/domain/constants";
import { buildProfessorHref } from "@/lib/utils/urlState";
import { pluralize } from "@/lib/utils/format";
import { GradeBar } from "@/components/charts/GradeBar";
import { Sparkline } from "@/components/charts/Sparkline";
import { RatingBlock } from "@/components/professor/RatingBlock";
import { GpaBlock } from "@/components/professor/GpaBlock";
import { BadgeRow } from "@/components/professor/BadgeRow";
import { VibeTags } from "@/components/professor/VibeTags";
import { CoursePills } from "@/components/professor/CoursePills";
import { MatchProvenanceIcon } from "@/components/professor/MatchProvenanceIcon";
import { OpenSectionsTable } from "@/components/professor/OpenSectionsTable";
import { ReviewQuote } from "@/components/professor/ReviewQuote";
import { AISummaryPanel } from "@/components/professor/AISummaryPanel";
import { ShortlistButton } from "@/components/shortlist/ShortlistButton";

export interface ProfessorCardProps {
  item: RankedProfessor;
  schoolId: string;
  subject: string;
  timezone: string;
  seatStatusAvailable: boolean;
  /** Shared y-range for the sparkline (payload.sparklineRange). */
  sparklineRange?: readonly [number, number];
  /** professorId → displayName for co-taught captions. */
  professorNames?: Readonly<Record<string, string>>;
  /** Course pill click → `course=` filter. */
  onCourseSelect?: (number: string) => void;
  selectedCourse?: string;
  yearsBack?: number;
  /** Start expanded (tests / deep links). */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * One ranked professor as a native `<details>` card (SPEC 3.2 item 5): the
 * summary row carries every headline stat; the panel (rendered only once
 * opened, to keep the DOM small) shows sections, two quotes and the AI verdict.
 */
export function ProfessorCard({
  item,
  schoolId,
  subject,
  timezone,
  seatStatusAvailable,
  sparklineRange,
  professorNames,
  onCourseSelect,
  selectedCourse,
  yearsBack,
  defaultOpen = false,
  className,
}: ProfessorCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { professor, scores } = item;
  const detailHref = buildProfessorHref(schoolId, professor.slug);
  const quotes = item.positiveReviews.slice(0, POSITIVE_PREVIEW_SHOWN);
  const headingId = `prof-${professor.slug}-name`;

  function onToggle(e: SyntheticEvent<HTMLDetailsElement>) {
    setOpen(e.currentTarget.open);
  }

  return (
    <details
      className={clsx("group rounded-card border border-border bg-surface-raised shadow-card open:border-border-strong", className)}
      open={defaultOpen || undefined}
      onToggle={onToggle}
      data-professor-id={professor.id}
    >
      <summary
        aria-labelledby={headingId}
        className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden"
      >
        <span
          aria-label={item.rank != null ? `Rank ${item.rank}` : undefined}
          className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold tabular-nums text-brand"
        >
          {item.rank ?? "–"}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-3">
          {/* Title row */}
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span id={headingId} className="text-base font-semibold text-ink">
              {professor.displayName}
            </span>
            {professor.isFictional ? <span className="text-[0.65rem] uppercase tracking-wide text-demo">fictional</span> : null}
            <VibeTags tags={item.vibeTags} />
            <BadgeRow badges={item.badges} seatStatusAvailable={seatStatusAvailable} />
            <span className="ml-auto inline-flex items-center gap-1">
              <MatchProvenanceIcon provenance={item.matchProvenance} />
              <ShortlistButton professor={professor} />
              <ChevronDown aria-hidden="true" className="h-4 w-4 text-ink-faint transition-transform group-open:rotate-180" />
            </span>
          </span>

          {/* Stats cluster */}
          <span className="grid gap-3 sm:grid-cols-[7.5rem_11rem_minmax(0,1fr)] sm:items-center">
            <RatingBlock scores={scores} />
            <GpaBlock scores={scores} yearsBack={yearsBack} />
            <span className="flex items-center gap-3">
              <GradeBar buckets={item.distribution} subject={professor.displayName} className="min-w-0 flex-1" />
              <Sparkline points={item.gpaByYear} range={sparklineRange} subject={professor.displayName} className="shrink-0" />
            </span>
          </span>

          {/* Courses */}
          <CoursePills
            courses={item.courses}
            schoolId={schoolId}
            subject={subject}
            onSelect={onCourseSelect}
            selected={selectedCourse}
          />
        </span>
      </summary>

      {open ? (
        <div className="flex flex-col gap-4 border-t border-border px-4 pb-4 pt-3 sm:pl-14">
          <OpenSectionsTable
            sections={item.openSections}
            timezone={timezone}
            seatStatusAvailable={seatStatusAvailable}
            professorId={professor.id}
            professorNames={professorNames}
            title={seatStatusAvailable ? "Open sections" : "Offered sections"}
          />

          <section aria-label="Positive reviews" className="flex flex-col gap-2">
            {quotes.length === 0 ? (
              <p className="m-0 text-sm text-ink-muted">No positive reviews yet</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {quotes.map((r) => (
                  <ReviewQuote key={r.id} review={r} />
                ))}
              </div>
            )}
            {scores.reviewCount > 0 ? (
              <Link href={`${detailHref}#reviews`} className="text-xs font-medium text-link hover:underline">
                See all {pluralize(scores.reviewCount, "review")} ({scores.criticalCount} critical)
              </Link>
            ) : null}
          </section>

          <AISummaryPanel summary={item.summary} variant="compact" detailHref={`${detailHref}#summary`} />

          <div>
            <Link href={detailHref} className="text-sm font-medium text-link hover:underline">
              View profile →
            </Link>
          </div>
        </div>
      ) : null}
    </details>
  );
}

export default ProfessorCard;
