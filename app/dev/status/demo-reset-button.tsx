"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";

interface Job {
  running: boolean;
  startedAt: string;
  finishedAt: string | null;
  log: string[];
  error: string | null;
  summary: { imported: number; planted: number; audit: { ok: boolean; chains: number; entries: number } } | null;
}

const fetchJob = () =>
  fetch("/api/demo/reset", { cache: "no-store" })
    .then((r) => r.json())
    .then((b: { job: Job | null }) => b.job);

/** Triggers POST /api/demo/reset and tails its log. */
export function DemoResetButton() {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  const follow = useCallback(() => {
    if (timer.current) return;
    timer.current = setInterval(() => {
      fetchJob()
        .then((j) => {
          setJob(j);
          if (!j?.running) stop();
        })
        .catch(() => undefined);
    }, 1500);
  }, []);

  useEffect(() => {
    let live = true;
    fetchJob()
      .then((j) => {
        if (!live) return;
        setJob(j);
        if (j?.running) follow();
      })
      .catch(() => undefined);
    return () => {
      live = false;
      stop();
    };
  }, [follow]);

  async function start() {
    setError(null);
    const res = await fetch("/api/demo/reset", { method: "POST" });
    const body = await res.json();
    if (!res.ok) setError(body.error);
    setJob(body.job ?? null);
    follow();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={start} disabled={job?.running}>
          {job?.running ? "Importing…" : "Run demo import"}
        </Button>
        <Link href="/library?live=1" className={buttonVariants({ variant: "outline" })}>
          Watch it in the library
        </Link>
        <span className="text-xs text-muted-foreground">Wipes demo data, re-imports Commons photos (cached) and re-plants the test inputs.</span>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {job ? (
        <pre className="max-h-56 overflow-auto rounded-md border bg-muted p-3 text-xs whitespace-pre-wrap" data-testid="demo-log">
          {job.log.slice(-40).join("\n") || "Starting…"}
          {job.summary ? `\nAudit: ${job.summary.audit.ok ? "all chains intact" : "BROKEN"} (${job.summary.audit.chains} chains, ${job.summary.audit.entries} rows)` : ""}
        </pre>
      ) : null}
    </div>
  );
}
