import clsx from "clsx";
import type { TermCode } from "@/lib/domain/types";
import { Chip } from "@/components/ui/Chip";
import { StatTooltip } from "@/components/ui/StatTooltip";
import { TOOLTIPS, fillTemplate } from "@/lib/copy/tooltips";
import { formatStampShort, isStale } from "@/lib/utils/format";
import { termDisplay, termHasEnded } from "@/lib/utils/term";

export interface TermPillProps {
  term: TermCode;
  seatsFetchedAt: string;
  timezone: string;
  seatStatusAvailable: boolean;
  termFallback?: boolean;
  /** The term the schedule was actually fetched for (meta.scheduleTerm) when `termFallback` is true. */
  scheduleTerm?: TermCode;
  /** Injected for deterministic tests / static builds. Default `new Date()`. */
  now?: Date;
  className?: string;
}

export interface TermPillText {
  main: string;
  snapshot: boolean;
  caveat: string | null;
  fallback: string | null;
}

/** All copy for the pill (pure; SPEC 3.2 item 1). */
export function termPillText(props: Omit<TermPillProps, "className">): TermPillText {
  const now = props.now ?? new Date();
  const stamp = formatStampShort(props.seatsFetchedAt, props.timezone);
  const snapshot = isStale(props.seatsFetchedAt, now) || termHasEnded(props.term, now);
  const main = props.seatStatusAvailable
    ? `${termDisplay(props.term)} · seats as of ${stamp}`
    : `${termDisplay(props.term)} · offered sections as of ${stamp}`;
  return {
    main,
    snapshot,
    caveat: props.seatStatusAvailable ? null : "seat availability not exposed by the public API",
    fallback:
      props.termFallback && props.scheduleTerm && props.scheduleTerm !== props.term
        ? `Schedule: ${termDisplay(props.scheduleTerm)} (${termDisplay(props.term)} not yet published)`
        : props.termFallback
          ? `Schedule: an earlier term (${termDisplay(props.term)} not yet published)`
          : null,
  };
}

/**
 * "Fall 2026 · seats as of Sep 3, 9:12 AM CT" — amber + "(snapshot)" when the
 * snapshot is > 24 h old or the term has ended; live mode adds the seat caveat.
 */
export function TermPill(props: TermPillProps) {
  const text = termPillText(props);
  const tooltip = props.seatStatusAvailable
    ? fillTemplate(TOOLTIPS.stats.seatsSnapshot.text, { fetchedAt: formatStampShort(props.seatsFetchedAt, props.timezone) })
    : TOOLTIPS.stats.offeredSections.text;
  return (
    <div className={clsx("flex flex-wrap items-center gap-1.5 text-xs", props.className)}>
      <StatTooltip label="When was seat status captured?" content={tooltip}>
        <Chip tone={text.snapshot ? "warning" : "neutral"} size="md">
          {text.main}
          {text.snapshot ? <span className="ml-1 font-normal">(snapshot)</span> : null}
        </Chip>
      </StatTooltip>
      {text.caveat ? <span className="text-ink-muted">· {text.caveat}</span> : null}
      {text.fallback ? (
        <Chip tone="warning" size="md">
          {text.fallback}
        </Chip>
      ) : null}
    </div>
  );
}

export default TermPill;
