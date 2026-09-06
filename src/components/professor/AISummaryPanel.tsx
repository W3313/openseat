import Link from "next/link";
import clsx from "clsx";
import { Sparkles } from "lucide-react";
import type { ProfessorSummary, TeachingFormat, Workload } from "@/lib/domain/types";
import { Chip } from "@/components/ui/Chip";
import { SUMMARY_SOURCE_LABELS } from "@/lib/copy/tooltips";
import { MIN_REVIEWS_RANKED } from "@/lib/domain/constants";
import { formatDate } from "@/lib/utils/format";

export const WORKLOAD_LABELS: Record<Workload, string> = { light: "Light workload", moderate: "Moderate workload", heavy: "Heavy workload" };
export const FORMAT_LABELS: Record<TeachingFormat, string> = {
  "lecture-heavy": "Lecture-heavy",
  discussion: "Discussion",
  "project-based": "Project-based",
  mixed: "Mixed format",
};
export const CONFIDENCE_LABELS = { low: "Low confidence", medium: "Medium confidence", high: "High confidence" } as const;

export const NO_SUMMARY_TEXT = `Not enough reviews to summarize (need ${MIN_REVIEWS_RANKED})`;

/** "Claude · claude-opus-5" / "Groq · openai/gpt-oss-20b" (+ " · Sep 3, 2026" when a timezone is given) or "Extractive summary · no API key". */
export function summarySourceLabel(
  summary: Pick<ProfessorSummary, "source" | "model" | "generatedAt" | "provider">,
  opts: { timezone?: string; withDate?: boolean } = {},
): string {
  if (summary.source !== "extractive") {
    const name = summary.source === "claude" ? SUMMARY_SOURCE_LABELS.claude : (summary.provider ?? SUMMARY_SOURCE_LABELS["openai-compatible"]);
    const parts = [name, summary.model ?? "unknown model"];
    if (opts.withDate && opts.timezone) parts.push(formatDate(summary.generatedAt, opts.timezone));
    return parts.join(" · ");
  }
  return SUMMARY_SOURCE_LABELS.extractive;
}

export interface AISummaryPanelProps {
  summary: ProfessorSummary | null;
  /** "compact" = card (verdict + chips + pill + "Read full summary"); "full" = detail page. */
  variant?: "compact" | "full";
  /** Detail-page href for the "Read full summary" link (compact only). */
  detailHref?: string;
  /** School timezone; enables the generated date in the full pill. */
  timezone?: string;
  className?: string;
}

function SourcePill({ summary, timezone, withDate }: { summary: ProfessorSummary; timezone?: string; withDate?: boolean }) {
  const label = summarySourceLabel(summary, { timezone, withDate });
  return (
    <Chip tone={summary.source !== "extractive" ? "brand" : "neutral"} size="sm" icon={<Sparkles className="h-3 w-3" />} title="How this summary was produced">
      <span data-testid="summary-source">{label}</span>
    </Chip>
  );
}

function SummaryChips({ summary }: { summary: ProfessorSummary }) {
  return (
    <ul aria-label="Summary at a glance" className="flex flex-wrap gap-1">
      <li>
        <Chip size="sm">{WORKLOAD_LABELS[summary.workload]}</Chip>
      </li>
      <li>
        <Chip size="sm">{FORMAT_LABELS[summary.format]}</Chip>
      </li>
      <li>
        <Chip size="sm" tone={summary.confidence === "high" ? "success" : summary.confidence === "medium" ? "info" : "warning"}>
          {CONFIDENCE_LABELS[summary.confidence]}
        </Chip>
      </li>
    </ul>
  );
}

/**
 * Structured AI verdict (SPEC F7). Renders the Claude/extractive JSON as a
 * designed panel; never calls any model. Server-safe (the "Why this?" toggle is
 * a native `<details>`).
 */
export function AISummaryPanel({ summary, variant = "compact", detailHref, timezone, className }: AISummaryPanelProps) {
  if (!summary) {
    return (
      <section aria-label="AI summary" className={clsx("rounded-lg border border-dashed border-border p-3 text-sm text-ink-muted", className)}>
        {NO_SUMMARY_TEXT}
      </section>
    );
  }

  if (variant === "compact") {
    return (
      <section aria-label="AI summary" className={clsx("flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-3", className)}>
        <p className="m-0 text-sm font-medium leading-snug text-ink">{summary.verdict}</p>
        <SummaryChips summary={summary} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SourcePill summary={summary} />
          {detailHref ? (
            <Link href={detailHref} className="text-xs font-medium text-link hover:underline">
              Read full summary →
            </Link>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="ai-summary-heading" className={clsx("flex flex-col gap-4 rounded-card border border-border bg-surface-raised p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ai-summary-heading" className="m-0 text-base font-semibold text-ink">
          AI summary
        </h2>
        <SourcePill summary={summary} timezone={timezone} withDate />
      </div>
      <p className="m-0 text-lg font-medium leading-snug text-ink">{summary.verdict}</p>
      <SummaryChips summary={summary} />
      {summary.teachingStyle.length ? (
        <p className="m-0 text-sm text-ink-muted">
          <span className="font-medium text-ink">Teaching style: </span>
          {summary.teachingStyle.join(" · ")}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="m-0 mb-1 text-xs font-semibold uppercase tracking-wide text-success">Strengths</h3>
          <ul className="m-0 list-disc space-y-1 pl-5 text-sm text-ink">
            {summary.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="m-0 mb-1 text-xs font-semibold uppercase tracking-wide text-warning">Watch-outs</h3>
          <ul className="m-0 list-disc space-y-1 pl-5 text-sm text-ink">
            {summary.watchOuts.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </div>
      <dl className="m-0 grid gap-2 text-sm">
        <div>
          <dt className="font-medium text-ink">Best for</dt>
          <dd className="m-0 text-ink-muted">{summary.bestFor}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Grading note</dt>
          <dd className="m-0 text-ink-muted">{summary.gradingNote}</dd>
        </div>
      </dl>
      {summary.evidenceReviewIds.length ? (
        <details className="group text-sm">
          <summary className="cursor-pointer font-medium text-link">Why this?</summary>
          <p className="mb-1 mt-2 text-xs text-ink-muted">Reviews the summary drew on:</p>
          <ul className="m-0 flex flex-wrap gap-1 pl-0">
            {summary.evidenceReviewIds.map((id, i) => (
              <li key={id} className="list-none">
                <a href={`#review-${encodeURIComponent(id)}`} className="rounded bg-surface-sunken px-1.5 py-0.5 text-xs text-link hover:underline">
                  Review {i + 1}
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

export default AISummaryPanel;
