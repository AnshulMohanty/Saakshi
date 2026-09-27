"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ComparisonCard } from "@/lib/measure/views";

// Client-only: the slider's inline styles differ between server and client renders (hydration mismatch).
const ReactCompareSlider = dynamic(() => import("react-compare-slider").then((m) => m.ReactCompareSlider), {
  ssr: false,
  loading: () => <div className="aspect-[4/3] w-full animate-pulse rounded-md bg-muted" />,
});

const fmt = (v: number, unit: "%" | "items") => (unit === "%" ? `${v.toFixed(1)}%` : `${Math.round(v)}`);
const signed = (v: number, unit: "%" | "items") => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${unit === "%" ? `${Math.abs(v).toFixed(1)} pts` : Math.abs(Math.round(v))}`;

/** A same-frame photo with its segmentation mask tinted on top (the mask is aligned: same crop). */
function Side({ url, maskUrl, show, alt, tint }: { url: string; maskUrl: string | null; show: boolean; alt: string; tint: string }) {
  return (
    <div className="relative aspect-[4/3] w-full bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred derivative */}
      <img src={url} alt={alt} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      {show && maskUrl ? (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: tint,
            opacity: 0.6,
            // Quoted: mask URLs contain ( ) and ; (e_extract:prompt_(a;b)), which end an unquoted url().
            WebkitMaskImage: `url(${JSON.stringify(maskUrl)})`,
            maskImage: `url(${JSON.stringify(maskUrl)})`,
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
            maskMode: "luminance",
          }}
        />
      ) : null}
    </div>
  );
}

export function CompareCard({ card, tint = "#f43f5e" }: { card: ComparisonCard; tint?: string }) {
  const [show, setShow] = useState(false);
  const primary = card.metrics[0];
  return (
    <article className="flex flex-col gap-3 rounded-lg border p-3" data-testid="compare-card">
      <header className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{card.spot?.name ?? "Spot"}</span>
          <Badge variant="outline">{card.origin === "checkin" ? "check-in" : card.origin === "manual" ? "chosen by a person" : "auto-paired"}</Badge>
          {card.gapHours !== null ? <span className="text-muted-foreground">{card.gapHours >= 48 ? `${Math.round(card.gapHours / 24)} days apart` : `${card.gapHours} h apart`}</span> : null}
          {card.distanceM !== null ? <span className="text-muted-foreground">· {Math.round(card.distanceM)} m</span> : null}
        </div>
        {card.before.maskUrl ? (
          <Button size="xs" variant={show ? "default" : "outline"} onClick={() => setShow((s) => !s)} aria-pressed={show} data-testid="show-mask">
            Show what was measured
          </Button>
        ) : null}
      </header>

      <ReactCompareSlider
        className="overflow-hidden rounded-md"
        itemOne={<Side url={card.before.viewUrl} maskUrl={card.before.maskUrl} show={show} alt={`Before, ${card.before.date}`} tint={tint} />}
        itemTwo={<Side url={card.after.viewUrl} maskUrl={card.after.maskUrl} show={show} alt={`After, ${card.after.date}`} tint={tint} />}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Before · {card.before.date}</span>
        <span>After · {card.after.date}</span>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {card.metrics.map((m) => (
          <div key={m.metric} className="flex flex-col gap-0.5 rounded-md bg-muted/50 p-2" data-metric={m.metric}>
            <dt className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {m.label}
              <Badge variant={m.method === "measured" ? "secondary" : "outline"}>{m.method === "measured" ? "measured" : "AI estimate"}</Badge>
              {m.confidence !== null ? <span>confidence {Math.round(m.confidence * 100)}%</span> : null}
            </dt>
            <dd className="font-heading text-lg tabular-nums">
              {fmt(m.before, m.unit)} → {fmt(m.after, m.unit)} <span className={m === primary ? "font-semibold" : ""}>({signed(m.delta, m.unit)})</span>
            </dd>
          </div>
        ))}
      </dl>
      {card.lowConfidence ? <p className="text-xs text-amber-600 dark:text-amber-400">Low confidence: the mask and the green-index check disagree by more than 15 points.</p> : null}
      {card.note ? <p className="text-xs text-muted-foreground">Note: {card.note}</p> : null}
      <p className="text-xs text-muted-foreground">{card.caveat}</p>
      <footer className="flex flex-wrap gap-3 text-xs">
        <Link className="underline underline-offset-2" href={`/e/${card.before.id}`}>
          Evidence: before photo
        </Link>
        <Link className="underline underline-offset-2" href={`/e/${card.after.id}`}>
          Evidence: after photo
        </Link>
        {card.compositeUrl ? (
          <a className="underline underline-offset-2" href={card.compositeUrl} target="_blank" rel="noreferrer">
            Side-by-side image
          </a>
        ) : null}
      </footer>
    </article>
  );
}
