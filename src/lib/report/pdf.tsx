/* eslint-disable jsx-a11y/alt-text -- @react-pdf/renderer <Image> is a PDF primitive, not an HTML img (no alt prop) */
/**
 * The Impact Report as an A4 PDF (@react-pdf/renderer), rendered from lib/report/sections.ts.
 * Images arrive as buffers (signed, face-blurred derivatives fetched server-side); QR codes are
 * generated here. The built-in PDF fonts cover WinAnsi only, so a few glyphs are mapped.
 */
import path from "node:path";
import { Document, Font, Image, Link, Page, Polyline, renderToBuffer, StyleSheet, Svg, Text, View, Line as SvgLine } from "@react-pdf/renderer";
import type { ComponentProps } from "react";
import QRCode from "qrcode";
import { FAMILY, scriptRuns } from "./scripts";
import type { Section } from "./sections";

/**
 * Bundled Noto fonts (SIL OFL 1.1, assets/fonts): Latin plus Devanagari, Bengali, Tamil and
 * Telugu, so every credit prints. Each text run gets the font of its script (lib/report/scripts.ts).
 */
let fontsRegistered = false;
export function registerFonts(dir = path.join(process.cwd(), "src", "assets", "fonts")) {
  if (fontsRegistered) return;
  for (const family of Object.values(FAMILY)) {
    Font.register({
      family,
      fonts: [
        { src: path.join(dir, `${family}-Regular.ttf`), fontWeight: "normal" },
        { src: path.join(dir, `${family}-Bold.ttf`), fontWeight: "bold" },
      ],
    });
  }
  // Never hyphenate: Indic words must not be split mid-cluster.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

/**
 * Characters the bundled fonts don't have → safe equivalents; anything outside the supported
 * scripts is dropped (it would print as an empty box).
 */
export function pdfText(s: string): string {
  return s
    .replace(/→/g, "->")
    .replace(/≈/g, "~")
    .replace(/≤/g, "<=")
    .replace(/✓/g, "")
    .replace(/[^\u0000-\u024f\u0370-\u04ff\u0900-\u097f\u0980-\u09ff\u0b80-\u0bff\u0c00-\u0c7f\ua8e0-\ua8ff\u2010-\u2027\u2030-\u205e\u2212\u20b9\u20ac\u200c\u200d]/g, "");
}

const C = { ink: "#111111", muted: "#555555", line: "#dddddd", accent: "#0f766e", red: "#b91c1c", amber: "#b45309" };
const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "NotoSans", color: C.ink, lineHeight: 1.35 },
  // Line heights are set per size: react-pdf inherits the page's as an absolute value.
  h1: { fontSize: 26, lineHeight: 1.2, fontFamily: "NotoSans", fontWeight: "bold", marginBottom: 8 },
  h2: { fontSize: 16, lineHeight: 1.25, fontFamily: "NotoSans", fontWeight: "bold", marginBottom: 10 },
  muted: { color: C.muted },
  small: { fontSize: 8, color: C.muted },
  card: { border: `1pt solid ${C.line}`, borderRadius: 4, padding: 8, marginBottom: 8 },
  row: { flexDirection: "row", gap: 10 },
  badge: { fontSize: 8, color: "#ffffff", backgroundColor: C.accent, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, alignSelf: "flex-start" },
  link: { color: C.accent, textDecoration: "none" },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 7, color: C.muted, flexDirection: "row", justifyContent: "space-between" },
});

function Footer({ url }: { url: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{pdfText(`Saakshi · verified evidence · ${url}`)}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

type Style = ComponentProps<typeof View>["style"];
/** Text in its script's font: Latin runs inherit the style, Indic runs switch family. */
const T = ({ children, style }: { children: string; style?: Style }) => {
  const runs = scriptRuns(pdfText(children));
  if (runs.every((r) => r.script === "latin")) return <Text style={style}>{pdfText(children)}</Text>;
  return (
    <Text style={style}>
      {runs.map((r, i) => (r.script === "latin" ? r.text : <Text key={i} style={{ fontFamily: FAMILY[r.script] }}>{r.text}</Text>))}
    </Text>
  );
};

function Trend({ points, unit }: { points: Array<{ t: number; value: number }>; unit: string }) {
  const W = 500;
  const H = 180;
  const t0 = Math.min(...points.map((p) => p.t));
  const t1 = Math.max(...points.map((p) => p.t));
  const vMax = Math.max(10, Math.ceil(Math.max(...points.map((p) => p.value)) / 10) * 10);
  const x = (t: number) => 30 + ((t - t0) / Math.max(1, t1 - t0)) * (W - 40);
  const y = (v: number) => H - 20 - (v / vMax) * (H - 30);
  return (
    <View>
      <Svg width={W} height={H}>
        <SvgLine x1={30} y1={H - 20} x2={W - 10} y2={H - 20} stroke={C.line} strokeWidth={1} />
        <SvgLine x1={30} y1={10} x2={30} y2={H - 20} stroke={C.line} strokeWidth={1} />
        <Polyline points={points.map((p) => `${x(p.t)},${y(p.value)}`).join(" ")} stroke={C.accent} strokeWidth={2} fill="none" />
      </Svg>
      <Text style={s.small}>{pdfText(`0 to ${vMax}${unit === "%" ? "%" : ""}; ${points.length} measured photos over time.`)}</Text>
    </View>
  );
}

export async function renderReportPdf(sections: Section[], images: Map<string, Buffer>): Promise<Buffer> {
  registerFonts();
  const qr = new Map<string, Buffer>();
  const qrOf = async (url: string) => {
    if (!qr.has(url)) qr.set(url, await QRCode.toBuffer(url, { type: "png", margin: 0, width: 240, errorCorrectionLevel: "M" }));
    return qr.get(url)!;
  };
  for (const sec of sections) {
    if (sec.kind === "cover") await qrOf(sec.url);
    if (sec.kind === "numbers") for (const i of sec.items) await qrOf(i.url);
    if (sec.kind === "gallery") for (const i of sec.items) await qrOf(i.url);
  }
  const img = (key: string) => images.get(key);
  const cover = sections.find((x) => x.kind === "cover") as Extract<Section, { kind: "cover" }>;

  const doc = (
    <Document title={pdfText(cover.title)} author="Saakshi" subject="Impact report">
      {sections.map((sec, i) => {
        switch (sec.kind) {
          case "cover":
            return (
              <Page key={i} size="A4" style={s.page}>
                <T style={{ ...s.muted, marginBottom: sec.banner ? 20 : 120 }}>Saakshi · impact report</T>
                {sec.banner ? <T style={{ color: C.amber, fontFamily: "NotoSans", fontWeight: "bold", border: `1pt solid ${C.amber}`, padding: 6, marginBottom: 80 }}>{sec.banner}</T> : null}
                <T style={s.h1}>{sec.title}</T>
                <T style={{ fontSize: 13, lineHeight: 1.3, marginBottom: 4 }}>{sec.subtitle}</T>
                <T style={{ fontSize: 13, lineHeight: 1.3, marginBottom: 30 }}>{sec.period}</T>
                <View style={s.row}>
                  <Image src={{ data: qr.get(sec.url)!, format: "png" }} style={{ width: 90, height: 90 }} />
                  <View style={{ justifyContent: "center" }}>
                    <T>Every number in this report links to the photos behind it.</T>
                    <Link src={sec.url} style={s.link}>
                      {pdfText(sec.url)}
                    </Link>
                  </View>
                </View>
                <T style={{ ...s.small, marginTop: 200 }}>{sec.generated}</T>
              </Page>
            );
          case "numbers":
            return (
              <Page key={i} size="A4" style={s.page}>
                <T style={s.h2}>Key numbers</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {sec.items.map((c) => (
                    <View key={c.id} style={{ ...s.card, width: 250, flexDirection: "row", gap: 8 }} wrap={false}>
                      <View style={{ flex: 1 }}>
                        <Text style={c.hidden ? { fontSize: 10, lineHeight: 1.3, color: C.muted } : { fontSize: 20, lineHeight: 1.25, fontFamily: "NotoSans", fontWeight: "bold" }}>
                          <Link src={c.url} style={{ ...s.link, color: c.hidden ? C.muted : C.ink }}>
                            {pdfText(c.value)}
                          </Link>
                        </Text>
                        {c.mock ? <T style={{ fontSize: 7, color: C.amber, fontFamily: "NotoSans", fontWeight: "bold" }}>MOCK OUTPUT</T> : null}
                        <T style={{ marginBottom: 3 }}>{c.label}</T>
                        <T style={s.badge}>{c.method}</T>
                        <T style={{ ...s.small, marginTop: 3 }}>{`From ${c.photos} photo${c.photos === 1 ? "" : "s"}${c.detail ? `. ${c.detail}` : ""}`}</T>
                      </View>
                      <Image src={{ data: qr.get(c.url)!, format: "png" }} style={{ width: 42, height: 42 }} />
                    </View>
                  ))}
                </View>
                {sec.notes.map((n) => (
                  <T key={n} style={{ marginTop: 4, color: C.amber }}>
                    {n}
                  </T>
                ))}
                <T style={{ ...s.h2, marginTop: 16 }}>Summary</T>
                <T>{sec.prose}</T>
                <Footer url={cover.url} />
              </Page>
            );
          case "pairs":
            return (
              <Page key={i} size="A4" style={s.page}>
                <T style={s.h2}>Before and after</T>
                {sec.items.length ? null : <T style={s.muted}>No before/after pair meets the rules for this period. Pairs are never forced.</T>}
                {sec.items.map((p) => (
                  <View key={p.key} style={{ marginBottom: 14 }} wrap={false}>
                    {img(p.image) ? <Image src={{ data: img(p.image)!, format: "jpg" }} style={{ width: 515 }} /> : null}
                    <T style={{ marginTop: 4, fontFamily: "NotoSans", fontWeight: "bold" }}>{`${p.spot ?? "Spot"} · ${p.before.date} -> ${p.after.date}`}</T>
                    {p.metrics.map((m) => (
                      <T key={m.label}>{m.hidden ? `${m.label}: ${m.delta} · ${m.method}` : `${m.label}: ${m.before} -> ${m.after} (${m.delta}) · ${m.method}`}</T>
                    ))}
                    {p.lowConfidence ? <T style={{ color: C.amber }}>Low confidence: the mask and the green-index check disagree by more than 15 points.</T> : null}
                    <Link src={`${cover.url.replace(/\/r\/.*$/, "")}/e/${p.before.id}`} style={s.link}>
                      Evidence: before photo
                    </Link>
                    <Link src={`${cover.url.replace(/\/r\/.*$/, "")}/e/${p.after.id}`} style={s.link}>
                      Evidence: after photo
                    </Link>
                  </View>
                ))}
                <T style={s.small}>{sec.caveat}</T>
                <Footer url={cover.url} />
              </Page>
            );
          case "trend":
            return (
              <Page key={i} size="A4" style={s.page}>
                <T style={s.h2}>{`${sec.trend.metric} at ${sec.trend.spot}`}</T>
                <T style={{ ...s.muted, marginBottom: 8 }}>No before/after pair meets the rules for this period, so here is every measured photo at the spot instead.</T>
                <Trend points={sec.trend.points} unit={sec.trend.unit} />
                <T style={{ ...s.small, marginTop: 8 }}>{sec.caveat}</T>
                <Footer url={cover.url} />
              </Page>
            );
          case "gallery":
            return (
              <Page key={i} size="A4" style={s.page}>
                <T style={s.h2}>Verified evidence</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {sec.items.map((g) => (
                    <View key={g.id} style={{ width: 164 }} wrap={false}>
                      {img(g.image) ? <Image src={{ data: img(g.image)!, format: "jpg" }} style={{ width: 164, height: 123, objectFit: "cover" }} /> : null}
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
                        <View style={{ flex: 1 }}>
                          <T style={s.badge}>{g.band}</T>
                          <T style={s.small}>{g.date}</T>
                          <Link src={g.url} style={{ ...s.link, fontSize: 7 }}>
                            Evidence page
                          </Link>
                        </View>
                        <Image src={{ data: qr.get(g.url)!, format: "png" }} style={{ width: 34, height: 34 }} />
                      </View>
                    </View>
                  ))}
                </View>
                <T style={{ ...s.small, marginTop: 6 }}>{"Faces are blurred. Scan a code to see that photo's full trust ledger and history."}</T>
                <Footer url={cover.url} />
              </Page>
            );
          case "excluded":
            return (
              <Page key={i} size="A4" style={s.page}>
                <T style={s.h2}>Flagged and excluded</T>
                <T style={{ ...s.muted, marginBottom: 8 }}>These photos are not counted in any number above. Each is listed with the reason.</T>
                {sec.items.length ? null : <T>None.</T>}
                {sec.items.map((e) => (
                  <View key={e.id} style={s.card} wrap={false}>
                    <T style={{ fontFamily: "NotoSans", fontWeight: "bold" }}>{`${e.band ?? "Not scored"}${e.testCase ? ` · planted test input (${e.testCase.replaceAll("_", " ")})` : ""}${e.status === "rejected" ? " · rejected by a reviewer" : ""} · ${e.date}`}</T>
                    {e.reasons.map((r) => (
                      <T key={r} style={{ color: C.red }}>
                        {r}
                      </T>
                    ))}
                    <Link src={e.url} style={s.link}>
                      Evidence page
                    </Link>
                  </View>
                ))}
                <Footer url={cover.url} />
              </Page>
            );
          case "method":
            return (
              <Page key={i} size="A4" style={s.page}>
                <T style={s.h2}>Method</T>
                {sec.paragraphs.map((p) => (
                  <T key={p} style={{ marginBottom: 6 }}>
                    {p}
                  </T>
                ))}
                <T style={{ ...s.h2, marginTop: 10 }}>Credits</T>
                {sec.credits.length ? null : <T>All photos were taken with Saakshi Witness Capture or uploaded by the project team.</T>}
                {sec.credits.map((c) => (
                  <View key={c.id} style={{ marginBottom: 3 }} wrap={false}>
                    <T>{`${c.title ?? "Untitled"} by ${c.author?.trim() || "unknown"}, ${c.license?.trim() || "licence unknown"}${c.testCase ? " (used to build a planted test input)" : ""}`}</T>
                    {c.url ? (
                      <Link src={c.url} style={{ ...s.link, fontSize: 7 }}>
                        {pdfText(c.url)}
                      </Link>
                    ) : null}
                  </View>
                ))}
                <Footer url={cover.url} />
              </Page>
            );
        }
      })}
    </Document>
  );
  return Buffer.from(await renderToBuffer(doc));
}
