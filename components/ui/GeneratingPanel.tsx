"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${String(rest).padStart(2, "0")}s` : `${rest}s`;
}

/**
 * In-flight feedback for a long generation.
 *
 * A Veo clip takes upwards of a minute, and the old UI answered that with a
 * static line of text — indistinguishable from a hung request. A live elapsed
 * counter plus the typical duration tells you whether waiting is still
 * reasonable, and the sweep confirms the page is alive.
 */
export default function GeneratingPanel({
  title,
  detail,
  typicalSeconds,
  className,
}: {
  title: string;
  detail?: string;
  /** Roughly how long this kind of job usually takes, in seconds. */
  typicalSeconds?: number;
  className?: string;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const overdue = typeof typicalSeconds === "number" && elapsed > typicalSeconds * 1.5;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("space-y-3 rounded-xl border border-line bg-well p-4", className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="text-xs tabular-nums text-ink-2">{formatElapsed(elapsed)}</p>
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-raised">
        <div
          className="h-full w-1/4 rounded-full bg-accent"
          style={{ animation: "sweep 1.6s var(--ease, ease-in-out) infinite" }}
          aria-hidden
        />
      </div>

      <p className="text-xs leading-relaxed text-ink-3">
        {overdue
          ? "This is taking longer than usual. The request is still open — provider queues can back up at peak times."
          : (detail ??
            (typeof typicalSeconds === "number"
              ? `Most clips finish in about ${formatElapsed(typicalSeconds)}.`
              : "Working…"))}
      </p>
    </div>
  );
}
