"use client";

import clsx from "clsx";
import { CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GpaPoint } from "@/lib/domain/types";
import { formatGpa, formatNumber } from "@/lib/utils/format";
import { sparklineAriaLabel, SPARKLINE_MIN_POINTS } from "./Sparkline";

export interface GpaTrendChartProps {
  points: readonly GpaPoint[];
  /** Shared y-range (payload.sparklineRange); defaults to the data's range padded by 0.15. */
  range?: readonly [number, number];
  /** Names the subject in the aria-label, e.g. the professor's name. */
  subject?: string;
  height?: number;
  className?: string;
}

/** [min, max] for the y axis, rounded outward to 0.1. */
export function trendRange(points: readonly GpaPoint[], range?: readonly [number, number]): [number, number] {
  if (range && range[0] < range[1]) return [range[0], range[1]];
  const gpas = points.map((p) => p.gpa);
  const lo = Math.min(...gpas) - 0.15;
  const hi = Math.max(...gpas) + 0.15;
  return [Math.max(0, Math.floor(lo * 10) / 10), Math.min(4, Math.ceil(hi * 10) / 10)];
}

/**
 * Larger GPA-by-year chart for the detail page (SPEC F19 / 3.4 item 3): recharts line with the
 * graded-student count labelled on each point. Renders nothing below 3 points.
 */
export function GpaTrendChart({ points, range, subject, height = 220, className }: GpaTrendChartProps) {
  if (points.length < SPARKLINE_MIN_POINTS) return null;
  const data = [...points].sort((a, b) => a.year - b.year).map((p) => ({ ...p, label: `n=${formatNumber(p.n)}` }));
  const [lo, hi] = trendRange(points, range);

  return (
    <figure
      className={clsx("m-0 flex flex-col gap-1 rounded-card border border-border bg-surface-raised p-3", className)}
    >
      <figcaption className="text-xs font-medium text-ink-muted">GPA by year (graded students per point)</figcaption>
      <div role="img" aria-label={sparklineAriaLabel(points, subject)} style={{ height }} className="w-full text-xs">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 18, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--pp-border)" />
            <XAxis dataKey="year" tick={{ fill: "var(--pp-ink-muted)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--pp-border)" }} />
            <YAxis
              domain={[lo, hi]}
              tickFormatter={(v: number) => v.toFixed(1)}
              tick={{ fill: "var(--pp-ink-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={34}
            />
            <Tooltip
              cursor={{ stroke: "var(--pp-border-strong)" }}
              contentStyle={{ background: "var(--pp-surface-overlay)", border: "1px solid var(--pp-border)", borderRadius: 8, color: "var(--pp-ink)", fontSize: 12 }}
              formatter={(value, _name, item) => {
                const n = Number((item as { payload?: { n?: number } }).payload?.n ?? 0);
                const gpa = typeof value === "number" ? value : Number(value);
                return [`${formatGpa(gpa)} (n=${formatNumber(n)})`, "GPA"];
              }}
              labelFormatter={(year) => `${year}`}
            />
            <Line type="monotone" dataKey="gpa" stroke="var(--pp-brand)" strokeWidth={2} dot={{ r: 3, fill: "var(--pp-brand)" }} activeDot={{ r: 5 }} isAnimationActive={false}>
              <LabelList dataKey="label" position="top" offset={8} style={{ fill: "var(--pp-ink-faint)", fontSize: 10 }} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>GPA by year</caption>
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">GPA</th>
            <th scope="col">Graded students</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.year}>
              <td>{p.year}</td>
              <td>{formatGpa(p.gpa)}</td>
              <td>{formatNumber(p.n)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export default GpaTrendChart;
