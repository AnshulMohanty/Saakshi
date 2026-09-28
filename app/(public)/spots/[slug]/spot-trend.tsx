"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { buildTimeAxis, fullDateTime } from "@/lib/charts/time-axis";
import type { SpotView } from "@/lib/measure/views";

type Row = { x: number; value: number | null; point?: SpotView["trend"][number] };

/**
 * Every measured photo at the spot on an adaptive time axis (lib/charts/time-axis.ts): each run
 * of photos gets its own stretch with round ticks in its own unit (minutes to years), distant
 * runs are separated by a labelled break, and hover shows the full date and time.
 */
export function SpotTrend({ trend, metric, offsetMinutes = 330 }: { trend: SpotView["trend"]; metric: NonNullable<SpotView["metric"]>; offsetMinutes?: number }) {
  const unit = metric.unit === "%" ? "%" : "";
  const axis = useMemo(() => buildTimeAxis(trend.map((p) => p.t), { offsetMinutes }), [trend, offsetMinutes]);
  const rows = useMemo<Row[]>(
    () =>
      [
        ...trend.map((p) => ({ x: axis.x(p.t), value: p.value, point: p })),
        // A null in each break stops the line from joining runs across the gap.
        ...axis.breaks.map((b) => ({ x: (b.x0 + b.x1) / 2, value: null })),
      ].sort((a, b) => a.x - b.x),
    [trend, axis],
  );
  const label = (x: number) => axis.ticks.find((t) => Math.abs(t.x - x) < 1e-9)?.label ?? "";
  const captions = axis.runs.filter((r) => r.caption).map((r) => r.caption!);
  return (
    <figure className="flex flex-col gap-1" data-testid="spot-trend" data-points={trend.length} data-runs={axis.runs.length}>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 20, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="x" type="number" domain={[0, 1]} ticks={axis.ticks.map((t) => t.x)} tickFormatter={label} tick={{ fontSize: 12 }} interval={0} />
            <YAxis unit={unit} domain={[0, (max: number) => Math.max(10, Math.ceil(max / 10) * 10)]} tick={{ fontSize: 12 }} width={44} />
            {axis.breaks.map((b) => (
              <ReferenceArea
                key={b.x0}
                x1={b.x0}
                x2={b.x1}
                fill="var(--color-muted)"
                fillOpacity={0.9}
                stroke="var(--color-border)"
                strokeDasharray="2 3"
                label={{ value: b.label, position: "insideTop", fontSize: 11, fill: "var(--color-muted-foreground)" }}
                data-testid="trend-break"
              />
            ))}
            <Tooltip
              formatter={(v) => [`${Number(v).toFixed(1)}${unit}`, metric.label]}
              labelFormatter={(_l, items) => {
                const p = (items?.[0]?.payload as Row | undefined)?.point;
                return p ? `${fullDateTime(p.t, p.precision, offsetMinutes)} · ${p.source === "witness" ? "check-in" : p.source}` : "";
              }}
            />
            <Line type="monotone" dataKey="value" connectNulls={false} stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {captions.length ? <figcaption className="text-xs text-muted-foreground">{captions.join(" · ")}</figcaption> : null}
    </figure>
  );
}

export const SpotMapLazy = dynamic(() => import("./spot-map"), { ssr: false, loading: () => <div className="h-64 w-full animate-pulse rounded-lg border bg-muted" /> });
