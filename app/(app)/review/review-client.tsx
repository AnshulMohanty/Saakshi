"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BandBadge, HistoryIntact, ReasonList } from "@/components/trust";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReviewQueue } from "@/lib/review";

type Decision = "approve" | "reject";
const MIN_NOTE = 3;
const label = (code: string) => code.toLowerCase().replaceAll("_", " ");

function readReviewer(): string {
  try {
    return localStorage.getItem("saakshi.reviewer") ?? "";
  } catch {
    return "";
  }
}

export function ReviewClient({ initial, initialReason }: { initial: ReviewQueue; initialReason: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [queue, setQueue] = useState(initial);
  const [reason, setReason] = useState(initialReason);
  const [index, setIndex] = useState(0);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<Decision | null>(null);
  const [reviewer, setReviewer] = useState(readReviewer);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  const items = queue.items;
  const current = items[Math.min(index, items.length - 1)] ?? null;

  const load = useCallback(async (r: string | null) => {
    const res = await fetch(`/api/review${r ? `?reason=${r}` : ""}`, { cache: "no-store" });
    if (res.ok) setQueue((await res.json()) as ReviewQueue);
  }, []);

  const chooseReason = (r: string | null) => {
    setReason(r);
    setIndex(0);
    router.replace(r ? `${pathname}?reason=${r}` : pathname, { scroll: false });
    void load(r);
  };

  const move = useCallback((d: number) => {
    setIndex((i) => Math.max(0, Math.min(items.length - 1, i + d)));
    setNote("");
    setPending(null);
    setMessage(null);
  }, [items.length]);

  const decide = useCallback(
    async (decision: Decision) => {
      if (!current || busy) return;
      if (note.trim().length < MIN_NOTE) {
        setPending(decision);
        setMessage(`Add a note to ${decision}, then press Enter.`);
        noteRef.current?.focus();
        return;
      }
      setBusy(true);
      try {
        const res = await fetch(`/api/review/${current.id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision, note, reviewer: reviewer.trim() || undefined }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setQueue((q) => ({ ...q, items: q.items.filter((i) => i.id !== current.id), total: q.total - 1 }));
        setMessage(`${decision === "approve" ? "Approved" : "Rejected"}. Score and band stay as the Trust Engine set them.`);
        setNote("");
        setPending(null);
        noteRef.current?.blur();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [busy, current, note, reviewer],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
      if (typing) {
        if (e.key === "Escape") {
          setPending(null);
          (e.target as HTMLElement).blur();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "j") move(1);
      else if (k === "k") move(-1);
      else if (k === "a" || k === "r") {
        e.preventDefault();
        void decide(k === "a" ? "approve" : "reject");
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, move]);

  const saveReviewer = (v: string) => {
    setReviewer(v);
    try {
      localStorage.setItem("saakshi.reviewer", v);
    } catch {
      // storage unavailable: keep it for this session only
    }
  };

  const counts = Object.entries(queue.counts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Review</h1>
          <p className="text-sm text-muted-foreground">
            {queue.total} photo(s) the Trust Engine did not verify, newest first. <kbd>J</kbd>/<kbd>K</kbd> move, <kbd>A</kbd> approve, <kbd>R</kbd> reject; a note is required. A decision never changes the score.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          Reviewer
          <Input value={reviewer} onChange={(e) => saveReviewer(e.target.value)} placeholder="your name" className="w-40" maxLength={80} />
        </label>
      </header>

      <div className="flex flex-wrap gap-1" role="toolbar" aria-label="Filter by reason">
        <Button size="xs" variant={reason ? "outline" : "default"} onClick={() => chooseReason(null)}>
          All
        </Button>
        {counts.map(([code, n]) => (
          <Button key={code} size="xs" variant={reason === code ? "default" : "outline"} onClick={() => chooseReason(code)} data-testid={`filter-${code}`}>
            {label(code)} · {n}
          </Button>
        ))}
      </div>

      {!current ? (
        <p className="rounded-lg border p-8 text-center text-muted-foreground" data-testid="review-empty">
          Nothing to review{reason ? ` for “${label(reason)}”` : ""}.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
          <ol className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto" data-testid="review-list">
            {items.map((it, i) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => move(i - index)}
                  aria-current={it.id === current.id}
                  className={`flex w-full items-center gap-2 rounded-md border p-1 text-left text-xs ${it.id === current.id ? "border-primary bg-muted" : "hover:bg-muted/50"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred thumbnail */}
                  <img src={it.thumbUrl} alt="" className="h-10 w-14 shrink-0 rounded object-cover" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <BandBadge band={it.band} score={it.score} />
                    <span className="truncate text-muted-foreground">{it.flags.map(label).join(", ") || "low score"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <article className="flex flex-col gap-3" data-testid="review-current" data-asset={current.id}>
            <div className={`grid gap-2 ${current.duplicate ? "sm:grid-cols-2" : ""}`}>
              <figure className="flex flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred preview */}
                <img src={current.previewUrl} alt={current.caption ?? "Photo under review"} className="max-h-[50vh] w-full rounded-md border bg-muted object-contain" />
                {current.duplicate ? <figcaption className="text-xs text-muted-foreground">This photo</figcaption> : null}
              </figure>
              {current.duplicate ? (
                <figure className="flex flex-col gap-1" data-testid="review-duplicate">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed, face-blurred preview */}
                  <img src={current.duplicate.previewUrl} alt="Closest near-duplicate" className="max-h-[50vh] w-full rounded-md border bg-muted object-contain" />
                  <figcaption className="text-xs text-muted-foreground">
                    {current.duplicate.exact ? "Identical file" : `${current.duplicate.similarityPct}% match`} · {current.duplicate.project ?? "Unassigned"}
                    {current.duplicate.capturedAt ? ` · ${new Date(current.duplicate.capturedAt).toLocaleDateString()}` : ""} ·{" "}
                    {current.duplicate.isLater ? "submitted later" : "the earlier photo"}{" "}
                    <Link href={`/library?asset=${current.duplicate.id}`} className="underline underline-offset-2">
                      open
                    </Link>
                  </figcaption>
                </figure>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <BandBadge band={current.band} score={current.score} />
              <HistoryIntact assetId={current.id} />
              <Badge variant="outline">{current.source.replace("_", " ")}</Badge>
              {current.testCase ? <Badge variant="destructive">Test input: {label(current.testCase)}</Badge> : null}
              <span className="text-muted-foreground">
                {current.project?.name ?? "Unassigned"}
                {current.capturedAt ? ` · ${new Date(current.capturedAt).toLocaleDateString()}` : ""}
              </span>
              <Link href={`/library?asset=${current.id}`} className="ml-auto underline underline-offset-2">
                Open in library
              </Link>
            </div>
            {current.caption ? <p className="text-sm">{current.caption}</p> : null}
            <ReasonList reasons={current.reasons} />

            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void decide(pending ?? "approve");
              }}
            >
              <label className="text-sm font-medium" htmlFor="review-note">
                Note (required){pending ? ` · ${pending}` : ""}
              </label>
              <Input id="review-note" ref={noteRef} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why? e.g. same photo as the Noyyal drive" maxLength={1000} data-testid="review-note" />
              <div className="flex gap-2">
                <Button type="button" onClick={() => void decide("approve")} disabled={busy} data-testid="review-approve">
                  Approve (A)
                </Button>
                <Button type="button" variant="destructive" onClick={() => void decide("reject")} disabled={busy} data-testid="review-reject">
                  Reject (R)
                </Button>
              </div>
            </form>
            {message ? (
              <p className="text-sm text-muted-foreground" role="status">
                {message}
              </p>
            ) : null}
          </article>
        </div>
      )}
    </div>
  );
}
