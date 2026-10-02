"use client";

import { CaptureScreen } from "./capture-screen";
import { useSimCapture, type SimConfig, type SimMode } from "./use-sim-capture";

/**
 * The prototype's review harness around the capture screen (CA:320-332): the state list and the
 * 390 × 844 device frame. Parity fixture only (/dev/parity/capture): the product shows the phone
 * screen alone (D-1188, brief B2).
 */
const STATES: Array<[SimMode, string, string]> = [
  ["live", "Live flow", "aim and shoot"],
  ["permission", "Permission prompt", "first run"],
  ["denied", "Location denied", ""],
  ["low", "Low accuracy", "weak GPS"],
  ["offline", "Offline", "queues"],
  ["done", "Done", "scored"],
];

export function CaptureHarness({ cfg, backHref }: { cfg: SimConfig; backHref: string }) {
  const { view, on, bindScreen, setMode, mode } = useSimCapture(cfg);
  return (
    <div className="design-root light" data-screen-label="Capture" style={{ minHeight: "100vh", boxSizing: "border-box", padding: "24px", display: "flex", flexWrap: "wrap", gap: "28px", justifyContent: "center", alignItems: "flex-start", fontFamily: "var(--font-sans)", color: "var(--foreground)", fontVariantNumeric: "tabular-nums", background: "var(--secondary)" }}>
      <div style={{ flex: "0 1 300px", display: "flex", flexDirection: "column", gap: "12px", paddingTop: "12px" }}>
        <a style={{ fontSize: "13px" }} href={backHref}>
          Back to the workspace
        </a>
        <h1 style={{ margin: "0", fontFamily: "var(--font-display)", fontWeight: "700", fontSize: "40px", lineHeight: "0.95" }}>Capture</h1>
        <p style={{ margin: "0", fontSize: "14px", lineHeight: "1.5", color: "var(--muted-foreground)" }}>The witness camera, 390 × 844. Pick a state, or run the live flow and press the shutter.</p>
        <div role="radiogroup" aria-label="State" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {STATES.map(([k, label, hint]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={mode === k}
              onClick={() => setMode(k)}
              style={{ display: "flex", justifyContent: "space-between", gap: "8px", padding: "9px 12px", borderRadius: "9px", border: `1px solid ${mode === k ? "var(--primary)" : "var(--hairline-strong)"}`, background: mode === k ? "var(--card)" : "transparent", cursor: "pointer", textAlign: "left" }}
            >
              <span>{label}</span>
              <span style={{ fontSize: "12px", color: "var(--muted-foreground)" }}>{hint}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{ position: "relative", width: "390px", height: "844px", flexShrink: "0", borderRadius: "44px", background: "var(--foreground)", padding: "10px", boxSizing: "border-box", boxShadow: "0 30px 80px color-mix(in srgb, var(--foreground) 25%, transparent)" }}>
        <CaptureScreen ref={bindScreen} view={view} on={on} feedImage={cfg.feed} drift framed />
      </div>
    </div>
  );
}
