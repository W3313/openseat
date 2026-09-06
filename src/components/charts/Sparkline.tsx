import clsx from "clsx";
import type { GpaPoint } from "@/lib/domain/types";
import { formatGpa, formatNumber } from "@/lib/utils/format";

/**
 * GPA-over-years sparkline (SPEC F19). Hand-rolled SVG, no hooks, SSR-safe.
 * `range` is the shared y-range for every sparkline on a page
 * (`RankingsPayload.sparklineRange`) so lines are comparable across cards.
 * Renders nothing when fewer than `minPoints` (3) points exist.
 */

export const SPARKLINE_MIN_POINTS = 3;

export interface SparklineProps {
  points: readonly GpaPoint[];
  /** [min, max] GPA shown on the y axis. Defaults to the data's own range padded by 0.1. */
  range?: readonly [number, number];
  width?: number;
  height?: number;
  minPoints?: number;
  /** Names the subject in the aria-label, e.g. the professor's name. */
  subject?: string;
  className?: string;
}

/** "GPA by year for X: 2022 3.35 (210 students), 2023 3.28 (210 students), …" */
export function sparklineAriaLabel(points: readonly GpaPoint[], subject?: string): string {
  const who = subject ? ` for ${subject}` : "";
  const parts = points.map((p) => `${p.year} ${formatGpa(p.gpa)} (${formatNumber(p.n)} students)`);
  return `GPA by year${who}: ${parts.join(", ")}`;
}

export function Sparkline({
  points,
  range,
  width = 72,
  height = 22,
  minPoints = SPARKLINE_MIN_POINTS,
  subject,
  className,
}: SparklineProps) {
  const sorted = [...points].filter((p) => Number.isFinite(p.gpa)).sort((a, b) => a.year - b.year);
  if (sorted.length < minPoints) return null;

  const gpas = sorted.map((p) => p.gpa);
  let [lo, hi] = range ?? [Math.min(...gpas) - 0.1, Math.max(...gpas) + 0.1];
  if (!(hi > lo)) {
    lo -= 0.1;
    hi += 0.1;
  }
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const xFor = (i: number) => pad + (sorted.length === 1 ? innerW / 2 : (i / (sorted.length - 1)) * innerW);
  const yFor = (gpa: number) => {
    const t = Math.min(1, Math.max(0, (gpa - lo) / (hi - lo)));
    return pad + (1 - t) * innerH;
  };
  const coords = sorted.map((p, i) => [xFor(i), yFor(p.gpa)] as const);
  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  const ariaLabel = sparklineAriaLabel(sorted, subject);
  const first = sorted[0];
  const final = sorted[sorted.length - 1];

  return (
    <span className={clsx("inline-flex flex-col", className)}>
      <svg
        role="img"
        aria-label={ariaLabel}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block overflow-visible"
      >
        <title>{ariaLabel}</title>
        <path d={path} fill="none" stroke="var(--color-brand)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={last[0]} cy={last[1]} r={2} fill="var(--color-brand)" />
      </svg>
      <span aria-hidden="true" className="text-[0.6rem] leading-none text-ink-faint">
        {first.year}–{final.year}
      </span>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">GPA</th>
            <th scope="col">Students</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.year}>
              <th scope="row">{p.year}</th>
              <td>{formatGpa(p.gpa)}</td>
              <td>{formatNumber(p.n)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </span>
  );
}

export default Sparkline;
