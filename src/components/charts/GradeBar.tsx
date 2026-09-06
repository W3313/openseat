import clsx from "clsx";
import type { GradeBuckets } from "@/lib/domain/types";
import { formatNumber } from "@/lib/utils/format";

/**
 * Stacked grade-distribution bar (SPEC F4, 3.0). Hand-rolled SVG, SSR-safe, no
 * hooks — usable from Server Components and inside the client `ProfessorCard`.
 *
 * Segments: A+ / A / A− / B-range / C-range / D-range / F / W with the
 * Okabe–Ito palette from globals.css (`--color-grade-*`). The SVG carries
 * `role="img"` + `aria-label`; a visually-hidden `<table>` lists the counts.
 * Each segment has a native `<title>` and a text label revealed on hover/focus.
 */

export type GradeSegmentId = "aPlus" | "a" | "aMinus" | "b" | "c" | "d" | "f" | "w";

export interface GradeSegment {
  id: GradeSegmentId;
  label: string;
  count: number;
  /** Share of all students (graded + W), 0..1. */
  share: number;
  /** CSS variable name from globals.css. */
  color: string;
  /** Whether the segment is light enough to need dark text on hover. */
  lightFill: boolean;
}

const SEGMENT_DEFS: readonly {
  id: GradeSegmentId;
  label: string;
  keys: readonly (keyof GradeBuckets)[];
  color: string;
  lightFill: boolean;
}[] = [
  { id: "aPlus", label: "A+", keys: ["aPlus"], color: "var(--color-grade-aplus)", lightFill: false },
  { id: "a", label: "A", keys: ["a"], color: "var(--color-grade-a)", lightFill: false },
  { id: "aMinus", label: "A−", keys: ["aMinus"], color: "var(--color-grade-aminus)", lightFill: true },
  { id: "b", label: "B", keys: ["bPlus", "b", "bMinus"], color: "var(--color-grade-b)", lightFill: false },
  { id: "c", label: "C", keys: ["cPlus", "c", "cMinus"], color: "var(--color-grade-c)", lightFill: true },
  { id: "d", label: "D", keys: ["dPlus", "d", "dMinus"], color: "var(--color-grade-d)", lightFill: true },
  { id: "f", label: "F", keys: ["f"], color: "var(--color-grade-f)", lightFill: false },
  { id: "w", label: "W", keys: ["w"], color: "var(--color-grade-w)", lightFill: false },
];

/** Collapse the 14 raw buckets into the 8 displayed segments (pure; exported for the OG image / tests). */
export function gradeSegments(buckets: GradeBuckets): GradeSegment[] {
  const total = Object.values(buckets).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
  return SEGMENT_DEFS.map((def) => {
    const count = def.keys.reduce((s, k) => s + (buckets[k] ?? 0), 0);
    return {
      id: def.id,
      label: def.label,
      count,
      share: total > 0 ? count / total : 0,
      color: def.color,
      lightFill: def.lightFill,
    };
  });
}

function pct(share: number, dp = 0): string {
  return `${(share * 100).toFixed(dp)}%`;
}

/** "Grade distribution for 1,313 students: A+ 6%, A 22%, …" */
export function gradeBarAriaLabel(segments: readonly GradeSegment[], total: number, subject?: string): string {
  const parts = segments.filter((s) => s.count > 0).map((s) => `${s.label} ${pct(s.share)}`);
  const who = subject ? ` for ${subject}` : "";
  if (total === 0) return `Grade distribution${who}: no graded students`;
  return `Grade distribution${who}, ${formatNumber(total)} students: ${parts.join(", ")}`;
}

export interface GradeBarProps {
  buckets: GradeBuckets;
  /** Pixel height of the bar. Default 14 (card); the detail page uses ~28. */
  height?: number;
  /** Names the subject of the bar in the aria-label, e.g. the professor's name. */
  subject?: string;
  /** Render the 8-item colour legend under the bar. Default false. */
  legend?: boolean;
  /** Segments become keyboard-focusable so the hover label can be reached by keyboard. Default false (the sr-only table already exposes every count); opt in where one bar is the subject of the page. */
  focusable?: boolean;
  className?: string;
}

export function GradeBar({ buckets, height = 14, subject, legend = false, focusable = false, className }: GradeBarProps) {
  const segments = gradeSegments(buckets);
  const total = segments.reduce((s, x) => s + x.count, 0);
  const ariaLabel = gradeBarAriaLabel(segments, total, subject);
  const labelHeight = 16;
  const svgHeight = height + labelHeight;

  if (total === 0) {
    return (
      <div className={clsx("flex flex-col gap-1", className)}>
        <div
          role="img"
          aria-label={ariaLabel}
          style={{ height }}
          className="w-full rounded-sm border border-dashed border-border-strong bg-surface-sunken"
        />
      </div>
    );
  }

  // Left edge of each segment as a share 0..1 (prefix sum), computed before render.
  const offsets: number[] = [];
  segments.reduce((acc, seg) => {
    offsets.push(acc);
    return acc + seg.share;
  }, 0);
  return (
    <figure className={clsx("m-0 flex w-full flex-col gap-1", className)}>
      <svg
        role="img"
        aria-label={ariaLabel}
        width="100%"
        height={svgHeight}
        className="block overflow-visible"
        style={{ height: svgHeight }}
      >
        {segments.map((seg, i) => {
          if (seg.count === 0) return null;
          const x = offsets[i];
          const mid = x + seg.share / 2;
          const title = `${seg.label}: ${formatNumber(seg.count)} students (${pct(seg.share, 1)})`;
          return (
            <g
              key={seg.id}
              className="group/seg outline-none"
              tabIndex={focusable ? 0 : undefined}
              aria-hidden={focusable ? undefined : true}
            >
              <title>{title}</title>
              <rect
                x={`${x * 100}%`}
                y={labelHeight}
                width={`${seg.share * 100}%`}
                height={height}
                fill={seg.color}
                className="transition-opacity group-hover/seg:opacity-80 group-focus-visible/seg:stroke-focus group-focus-visible/seg:stroke-2"
              />
              <text
                x={`${mid * 100}%`}
                y={labelHeight - 5}
                textAnchor="middle"
                className={clsx(
                  "pointer-events-none fill-ink text-[10px] font-semibold opacity-0",
                  "group-hover/seg:opacity-100 group-focus-visible/seg:opacity-100",
                )}
              >
                {seg.label} {pct(seg.share)}
              </text>
            </g>
          );
        })}
      </svg>
      {legend ? (
        <ul aria-hidden="true" className="flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] text-ink-muted">
          {segments.map((seg) => (
            <li key={seg.id} className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: seg.color }} />
              {seg.label} {pct(seg.share)}
            </li>
          ))}
        </ul>
      ) : null}
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Grade</th>
            <th scope="col">Students</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((seg) => (
            <tr key={seg.id}>
              <th scope="row">{seg.label}</th>
              <td>{formatNumber(seg.count)}</td>
              <td>{pct(seg.share, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export default GradeBar;
