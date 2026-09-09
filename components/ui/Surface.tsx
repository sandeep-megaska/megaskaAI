"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** A raised panel. The default container for a group of related controls. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-line bg-surface", className)} {...rest} />;
}

/** A recessed area inside a Card — previews, read-only summaries, drop targets. */
export function Well({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-line bg-well", className)} {...rest} />;
}

export function SectionHeading({
  title,
  description,
  action,
  step,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Numbers a step in a sequential workflow. */
  step?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {typeof step === "number" ? (
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-xs font-semibold tabular-nums text-accent"
            aria-hidden
          >
            {step}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
          {description ? <p className="mt-1 text-xs leading-relaxed text-ink-3">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "border-line-strong text-ink-2",
  accent: "border-accent/40 bg-accent/10 text-accent",
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  danger: "border-danger/40 bg-danger/10 text-danger",
};

/** A small read-only fact: a duration, a mode, a count. Never interactive. */
export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Placeholder for a region that has no content yet — never a blank rectangle. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? <div className="text-ink-3">{icon}</div> : null}
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink-2">{title}</p>
        {description ? <p className="mx-auto max-w-sm text-xs leading-relaxed text-ink-3">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Loading placeholder that matches the shape of the content it stands in for. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl bg-raised", className)} aria-hidden>
      <div
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent"
        style={{ animation: "shimmer 1.8s infinite" }}
      />
    </div>
  );
}
