import { describe, expect, it } from "vitest";
import { pdfText, renderReportPdf } from "@/lib/report/pdf";
import { scriptOf, scriptRuns } from "@/lib/report/scripts";
import type { Section } from "@/lib/report/sections";

describe("script runs", () => {
  it("detects Devanagari, Tamil, Bengali, Telugu and Latin", () => {
    expect([scriptOf("क".codePointAt(0)!), scriptOf("த".codePointAt(0)!), scriptOf("ক".codePointAt(0)!), scriptOf("త".codePointAt(0)!), scriptOf("a".codePointAt(0)!)]).toEqual([
      "devanagari",
      "tamil",
      "bengali",
      "telugu",
      "latin",
    ]);
    expect(scriptOf(" ".codePointAt(0)!)).toBeNull();
  });

  it("splits mixed text; spaces, punctuation and combining marks stay in their run", () => {
    expect(scriptRuns("Photo by ஜெகநாதன், CC BY-SA")).toEqual([
      { text: "Photo by ", script: "latin" },
      { text: "ஜெகநாதன், ", script: "tamil" },
      { text: "CC BY-SA", script: "latin" },
    ]);
    expect(scriptRuns("प्रकाश क्षत्रिय")).toEqual([{ text: "प्रकाश क्षत्रिय", script: "devanagari" }]);
    expect(scriptRuns("“সুমন”")).toEqual([{ text: "“সুমন”", script: "bengali" }]);
  });

  it("pdfText keeps Indic text and maps glyphs the fonts lack", () => {
    expect(pdfText("0.1% → 6.0% (≈12, −5.9) साक्षी")).toBe("0.1% -> 6.0% (~12, −5.9) साक्षी");
    expect(pdfText("写真 by ஜெகநாதன்")).toBe(" by ஜெகநாதன்"); // unsupported scripts drop out, never boxes
  });
});

describe("credits print in every bundled script", () => {
  it("embeds Noto Sans Tamil and Devanagari for Tamil and Devanagari author names", async () => {
    const sections: Section[] = [
      { kind: "cover", title: "Font test", subtitle: "Impact report", period: "1 September 2017 to 30 September 2017", generated: "Generated today", url: "https://s.example/r/x", banner: null },
      {
        kind: "method",
        paragraphs: ["Credits test."],
        credits: [
          { id: "t", title: "Noyyal River", author: "ஜெகநாதன்", license: "CC BY-SA 4.0", url: "https://commons.wikimedia.org/wiki/File:A.jpg", testCase: null },
          { id: "d", title: "Yamuna ghat", author: "प्रकाश क्षत्रिय", license: "CC BY 4.0", url: "https://commons.wikimedia.org/wiki/File:B.jpg", testCase: null },
        ],
      },
    ];
    const pdf = await renderReportPdf(sections, new Map());
    const raw = pdf.toString("latin1");
    expect(raw.startsWith("%PDF-")).toBe(true);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSansTamil/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSansDevanagari/);
    expect(raw).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSans-/);
    expect(raw).not.toMatch(/Helvetica/);
  });
});
