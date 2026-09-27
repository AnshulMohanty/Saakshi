"use client";

import dynamic from "next/dynamic";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SpotView } from "@/lib/measure/views";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const tick = (t: number) => {
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** Every measured photo at the spot, on a real time axis. */
export function SpotTrend({ trend, metric }: { trend: SpotView["trend"]; metric: NonNullable<SpotView["metric"]> }) {
  const unit = metric.unit === "%" ? "%" : "";
  return (
    <div className="h-64 w-full" data-testid="spot-trend" data-points={trend.length}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={tick} tick={{ fontSize: 12 }} />
          <YAxis unit={unit} domain={[0, (max: number) => Math.max(10, Math.ceil(max / 10) * 10)]} tick={{ fontSize: 12 }} width={44} />
          <Tooltip
            formatter={(v) => [`${Number(v).toFixed(1)}${unit}`, metric.label]}
            labelFormatter={(_l, items) => {
              const p = items?.[0]?.payload as SpotView["trend"][number] | undefined;
              return p ? `${p.label} · ${p.source === "witness" ? "check-in" : p.source}` : "";
            }}
          />
          <Line type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 4 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export const SpotMapLazy = dynamic(() => import("./spot-map"), { ssr: false, loading: () => <div className="h-64 w-full animate-pulse rounded-lg border bg-muted" /> });
