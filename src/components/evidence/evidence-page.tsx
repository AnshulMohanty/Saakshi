"use client";

import { useEffect, useState } from "react";
import { EvidenceViewer, type EvidenceViewerProps } from "@/components/evidence-viewer";
import { Glyph } from "@/components/glyph";
import { BAND_COLOR, BAND_LABEL } from "@/components/trust-meter";
import { LOGO_BITS } from "@/lib/glyph";
import { verifyWeb, type WebChainRow } from "@/lib/hashchain-web";
import type { LedgerRow, RuleChip } from "@/lib/trust/labels";
import type { TrustBand } from "@/lib/trust/types";

/**
 * The public evidence page (Evidence_Page → /e/[assetId], template EV:351-461): the photo's
 * layers, its proof strip and ledger, fingerprint, facts, every edit on the public copy and the
 * audit timeline, whose hashes the browser recomputes from /api/audit/chain (B5.9). Below the
 * design's grid, what the product also knows: attestation, near-duplicates, before/after pairs.
 */
export interface EvidencePageData {
  code: string;
  title: string;
  when: string;
  crumb: { label: string; href: string | null };
  trust: { score: number | null; band: TrustBand | null; hiddenText: string | null; mock: boolean; /** The badge when `mock` (default "Mock output"). */ mockTag?: string };
  viewer: EvidenceViewerProps;
  chips: RuleChip[];
  ledger: LedgerRow[];
  fingerprint: { bits: string; hex: string; text: string } | null;
  facts: Array<{ k: string; v: string; mono?: boolean }>;
  edits: Array<{ name: string; code: string; why: string }>;
  publicUrl: string;
  /** Live chain from the API; or rows to verify here; or lines already computed (the fixture: the prototype's own hash scheme). */
  chain: { assetId: string } | { rows: Array<WebChainRow & { label: string; when: string }> } | { fixed: Array<{ label: string; when: string; hash: string }>; intact: boolean };
  more: Array<{ title: string; lines: Array<{ text: string; href?: string }> }>;
  credit: { before: string; title: string; href: string | null; after: string } | null;
  record: string;
  homeHref: string;
}

const CHIP = { good: { bg: "var(--verified-tint)", fg: "var(--verified-ink)", dot: "var(--verified)" }, neutral: { bg: "var(--background)", fg: "var(--muted-foreground)", dot: "var(--neutral-dot)" }, warn: { bg: "var(--background)", fg: "var(--muted-foreground)", dot: "var(--review)" }, bad: { bg: "var(--flagged-tint)", fg: "var(--flagged-ink)", dot: "var(--flagged)" } } as const;
// Point counts are text: the neutral tone uses the muted foreground (AA on cards), not the lighter dot colour.
const PTS = { good: "var(--verified)", neutral: "var(--muted-foreground)", warn: "var(--review)", bad: "var(--flagged)" } as const;
const CARD = { display: "flex", flexDirection: "column", padding: "16px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" } as const;
const H2 = { margin: "0 0 6px", fontSize: "15px", fontWeight: "600" } as const;

type Line = { label: string; when: string; hash: string };

function useChain(chain: EvidencePageData["chain"]) {
  const [state, setState] = useState<{ lines: Line[]; intact: boolean | null }>({ lines: [], intact: null });
  useEffect(() => {
    let live = true;
    const run = async () => {
      if ("fixed" in chain) {
        await Promise.resolve();
        if (live) setState({ lines: chain.fixed, intact: chain.intact });
        return;
      }
      let rows: Array<WebChainRow & { label: string; when: string }>;
      if ("rows" in chain) rows = chain.rows;
      else {
        const r = await fetch(`/api/audit/chain?assetId=${chain.assetId}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { rows: Array<WebChainRow & { label: string; seq: number }> };
        rows = j.rows.map((x) => ({ ...x, when: whenOf(String(x.row.at)) }));
      }
      if (live) setState({ lines: rows.map((x) => ({ label: x.label, when: x.when, hash: "computing…" })), intact: null });
      const v = await verifyWeb(rows);
      if (live) setState({ lines: rows.map((x, i) => ({ label: x.label, when: x.when, hash: v.hashes[i] ? `${v.hashes[i].slice(0, 16)}…` : "not checked" })), intact: v.brokenAt === null });
    };
    run().catch(() => live && setState((s) => ({ ...s, intact: false })));
    return () => {
      live = false;
    };
  }, [chain]);
  return state;
}

const whenOf = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 330 * 60_000);
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${d.getUTCDate()} ${M} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} IST`;
};

export function EvidencePage({ data }: { data: EvidencePageData }) {
  const [copied, setCopied] = useState(false);
  const chain = useChain(data.chain);
  const t = data.trust;
  const color = t.band ? BAND_COLOR[t.band] : "var(--muted-foreground)";
  const share = () => {
    navigator.clipboard?.writeText(location.href).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="design-root" data-screen-label="Evidence page" style={{ fontFamily: "var(--font-sans)", color: "var(--foreground)", fontVariantNumeric: "tabular-nums", background: "var(--background)", minHeight: "100vh" }}>
      <header style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px clamp(16px,4vw,48px)", background: "var(--card)", borderBottom: "1px solid var(--border)" }}>
        <a href={data.homeHref} style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--foreground)", textDecoration: "none" }}>
          <Glyph bits={LOGO_BITS} size={22} colors={{ off: "transparent" }} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: "650", fontSize: "19px" }}>Saakshi</span>
        </a>
        <span style={{ flex: "1", minWidth: "0", fontSize: "13px", color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {data.crumb.href ? (
            <a href={data.crumb.href} style={{ color: "var(--muted-foreground)" }}>
              {data.crumb.label}
            </a>
          ) : (
            data.crumb.label
          )}
          , evidence
        </span>
        <button type="button" onClick={share} style={{ flexShrink: "0", whiteSpace: "nowrap", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: "13px" }}>
          {copied ? "Link copied" : "Copy link"}
        </button>
      </header>

      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "clamp(16px,3vw,40px) clamp(16px,4vw,48px) 64px", display: "flex", flexDirection: "column", gap: "24px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--muted-foreground)" }}>{data.code}</span>
            <h1 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontStretch: "92%", fontSize: "clamp(32px,5vw,56px)", lineHeight: "0.95", letterSpacing: "-0.015em" }}>{data.title}</h1>
            <span style={{ fontSize: "14px", color: "var(--muted-foreground)" }}>{data.when}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" }}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "44px", lineHeight: "1", color }}>{t.score ?? "–"}</span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontWeight: "600", color }}>{t.band ? BAND_LABEL[t.band] : (t.hiddenText ?? "Not scored yet")}</span>
              <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{t.mock ? `trust score, fixed rules (${t.mockTag ?? "Mock output"})` : "trust score, fixed rules"}</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
          <EvidenceViewer {...data.viewer} />
          <div style={{ flex: "1 1 340px", minWidth: "0", display: "flex", flexDirection: "column", gap: "16px" }}>
            <section aria-label="Proof strip" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {data.chips.map((c) => (
                <span key={c.code} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "5px 9px", borderRadius: "7px", background: CHIP[c.tone].bg, color: CHIP[c.tone].fg, fontSize: "12px" }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "3px", background: CHIP[c.tone].dot }} />
                  {c.text}
                </span>
              ))}
            </section>
            <section style={CARD}>
              <h2 style={H2}>Ledger</h2>
              {data.ledger.map((r) => (
                <div key={r.signal} style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "8px 0", borderTop: "1px solid var(--secondary)", fontSize: "14px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: "0" }}>
                    <span>{r.label}</span>
                    <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{r.note}</span>
                  </div>
                  <span style={{ flexShrink: "0", whiteSpace: "nowrap", fontWeight: "600", color: PTS[r.tone] }}>{`${r.pts} of ${r.max}`}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "10px", borderTop: "1px solid var(--foreground)", fontWeight: "600" }}>
                <span>Total</span>
                <span style={{ color }}>{t.band ? `${t.score}, ${BAND_LABEL[t.band]}` : (t.hiddenText ?? "–")}</span>
              </div>
            </section>
            {data.fingerprint && (
              <section style={{ display: "flex", gap: "14px", alignItems: "center", padding: "16px", borderRadius: "12px", background: "var(--card)", border: "1px solid var(--border)" }}>
                <Glyph bits={data.fingerprint.bits} size={88} label="Fingerprint glyph of this photo" style={{ flexShrink: "0" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "0" }}>
                  <span style={{ fontWeight: "600", fontSize: "15px" }}>Fingerprint</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", color: "var(--primary)" }}>{data.fingerprint.hex}</span>
                  <span style={{ fontSize: "12px", color: "var(--muted-foreground)", lineHeight: "1.4" }}>{data.fingerprint.text}</span>
                </div>
              </section>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: "16px" }}>
          <section style={CARD}>
            <h2 style={H2}>Facts</h2>
            {data.facts.map((f) => (
              <div key={f.k} style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "7px 0", borderTop: "1px solid var(--secondary)", fontSize: "14px" }}>
                <span style={{ color: "var(--muted-foreground)" }}>{f.k}</span>
                <span style={{ textAlign: "right", fontFamily: f.mono ? "var(--font-mono)" : "inherit" }}>{f.v}</span>
              </div>
            ))}
          </section>
          <section style={{ ...CARD, gap: "10px" }}>
            <h2 style={{ margin: "0", fontSize: "15px", fontWeight: "600" }}>Every edit on the public copy</h2>
            <p style={{ margin: "0", fontSize: "13px", lineHeight: "1.5", color: "var(--muted-foreground)" }}>The public image is served from a signed link. Each edit below is part of what&apos;s signed, so changing or removing any of them, including the face blur, makes the link fail.</p>
            {data.edits.map((e) => (
              <div key={e.name + e.code} style={{ display: "flex", flexDirection: "column", gap: "3px", padding: "8px 10px", borderRadius: "8px", background: "var(--background)" }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "14px", fontWeight: "500" }}>
                  <span>{e.name}</span>
                  <code style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--primary)", wordBreak: "break-all", textAlign: "right" }}>{e.code}</code>
                </span>
                <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{e.why}</span>
              </div>
            ))}
            <code style={{ display: "block", padding: "10px", borderRadius: "8px", background: "var(--n-background)", color: "var(--code-ink)", fontFamily: "var(--font-mono)", fontSize: "11px", lineHeight: "1.5", wordBreak: "break-all" }}>{data.publicUrl}</code>
          </section>
          <section style={{ ...CARD, gap: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
              <h2 style={{ margin: "0", fontSize: "15px", fontWeight: "600" }}>Audit timeline</h2>
              <span role="status" style={{ display: "flex", alignItems: "center", gap: "6px", padding: "3px 9px", borderRadius: "7px", background: chain.intact === false ? "var(--flagged-tint)" : "var(--verified-tint)", color: chain.intact === false ? "var(--l-destructive)" : "var(--verified)", fontSize: "12px", fontWeight: "600" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "3px", background: chain.intact === false ? "var(--l-destructive)" : "var(--verified)" }} />
                {chain.intact === null ? "Checking history" : chain.intact ? "History intact" : "History broken"}
              </span>
            </div>
            <ol style={{ margin: "0", padding: "0", listStyle: "none", display: "flex", flexDirection: "column" }}>
              {chain.lines.map((a, i) => (
                <li key={i} style={{ display: "grid", gridTemplateColumns: "14px 1fr", gap: "10px" }}>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <span style={{ width: "10px", height: "10px", borderRadius: "5px", marginTop: "5px", background: "var(--primary)" }} />
                    <span style={{ flex: "1", width: "1px", background: "var(--border)" }} />
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", gap: "1px", paddingBottom: "12px" }}>
                    <span style={{ fontSize: "14px", fontWeight: "500" }}>{a.label}</span>
                    <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{a.when}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--muted-foreground)" }}>{a.hash}</span>
                  </span>
                </li>
              ))}
            </ol>
            <span style={{ fontSize: "12px", color: "var(--muted-foreground)", lineHeight: "1.45" }}>Each entry&apos;s hash includes the one before it, recomputed in your browser just now. Any change to an earlier entry would break every hash after it.</span>
          </section>
        </div>

        {data.more.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: "16px" }}>
            {data.more.map((m) => (
              <section key={m.title} style={CARD}>
                <h2 style={H2}>{m.title}</h2>
                {m.lines.map((l, i) => (
                  <div key={i} style={{ padding: "7px 0", borderTop: "1px solid var(--secondary)", fontSize: "14px" }}>
                    {l.href ? <a href={l.href}>{l.text}</a> : l.text}
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}

        <footer style={{ display: "flex", flexWrap: "wrap", gap: "8px 24px", justifyContent: "space-between", fontSize: "12px", color: "var(--muted-foreground)", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
          {data.credit ? (
            <span>
              {data.credit.before}
              {data.credit.href ? <a href={data.credit.href}>{data.credit.title}</a> : data.credit.title}
              {data.credit.after}
            </span>
          ) : (
            <span>Witness photo. Faces blurred.</span>
          )}
          <span>{data.record}</span>
        </footer>
      </main>
    </div>
  );
}
