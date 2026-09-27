"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function GenerateReportButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        disabled={busy}
        data-testid="generate-report"
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch("/api/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId }) });
            const body = (await res.json()) as { url?: string; error?: string };
            if (!res.ok || !body.url) throw new Error(body.error ?? `HTTP ${res.status}`);
            router.push(body.url);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setBusy(false);
          }
        }}
      >
        {busy ? "Generating…" : "Generate impact report"}
      </Button>
      {error ? <span className="text-sm text-destructive">{error}</span> : null}
    </div>
  );
}
