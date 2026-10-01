"use client";

/** Prints the poster (hidden in print). Sits on the desk, outside the sheet. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{ position: "fixed", top: "12px", right: "12px", zIndex: "1", padding: "9px 14px", borderRadius: "9px", border: "0", background: "var(--primary)", color: "var(--card)", cursor: "pointer", fontSize: "14px", fontWeight: "500" }}
    >
      Print (A4)
    </button>
  );
}
