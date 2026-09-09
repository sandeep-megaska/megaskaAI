"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

const TONES: Record<AlertTone, { wrap: string; icon: ReactNode }> = {
  info: { wrap: "border-line-strong bg-raised text-ink-2", icon: <Info className="h-4 w-4 text-ink-2" /> },
  success: {
    wrap: "border-success/40 bg-success/10 text-success",
    icon: <CheckCircle2 className="h-4 w-4 text-success" />,
  },
  warning: {
    wrap: "border-warning/40 bg-warning/10 text-warning",
    icon: <AlertTriangle className="h-4 w-4 text-warning" />,
  },
  danger: { wrap: "border-danger/40 bg-danger/10 text-danger", icon: <XCircle className="h-4 w-4 text-danger" /> },
};

/**
 * Status message. Errors and successes announce themselves — `role="alert"`
 * for failures (interrupts), `role="status"` for everything else (polite), so
 * a screen-reader user learns a generation failed without hunting for the text.
 */
export default function Alert({
  tone = "info",
  title,
  children,
  onDismiss,
  className,
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const { wrap, icon } = TONES[tone];

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      aria-live={tone === "danger" ? "assertive" : "polite"}
      className={cn("flex items-start gap-3 rounded-xl border px-3.5 py-3 text-sm", wrap, className)}
    >
      <span className="mt-0.5 shrink-0" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-[13px] leading-relaxed break-words opacity-90">{children}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="-mr-1 -mt-1 rounded-lg p-1 opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
