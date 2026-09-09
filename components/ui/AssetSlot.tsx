"use client";

import { ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import MediaFrame from "./MediaFrame";
import { Badge } from "./Surface";

/**
 * One pickable image slot — a start/end frame, or a garment reference.
 *
 * The whole empty slot is the button, so the target is the full tile rather
 * than a small link underneath it, and a filled slot keeps its remove control
 * on the thumbnail instead of adding another row of buttons.
 */
export default function AssetSlot({
  label,
  hint,
  url,
  required = false,
  missing = false,
  onPick,
  onClear,
  className,
}: {
  label: string;
  hint?: string;
  url?: string | null;
  required?: boolean;
  /** Required but not yet filled — draws the slot in the warning hue. */
  missing?: boolean;
  onPick: () => void;
  onClear?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="min-w-0 text-xs font-medium text-ink">{label}</span>
        {required ? (
          <Badge tone={missing ? "warning" : "neutral"}>{missing ? "Required" : "Set"}</Badge>
        ) : (
          <span className="shrink-0 text-[11px] text-ink-3">Optional</span>
        )}
      </div>

      <div
        className={cn(
          "relative overflow-hidden rounded-xl border transition-colors",
          missing ? "border-warning/50" : "border-line",
        )}
      >
        {url ? (
          <>
            <MediaFrame src={url} alt={label} ratio="landscape" fit="cover" />
            <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-gradient-to-t from-black/80 to-transparent p-1.5">
              <button
                type="button"
                onClick={onPick}
                className="flex-1 rounded-lg bg-black/50 px-2 py-1.5 text-[11px] font-medium text-white backdrop-blur transition-colors hover:bg-black/70"
              >
                Replace
              </button>
              {onClear ? (
                <button
                  type="button"
                  onClick={onClear}
                  aria-label={`Clear ${label}`}
                  className="rounded-lg bg-black/50 px-2 py-1.5 text-white backdrop-blur transition-colors hover:bg-danger/70"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={onPick}
            className={cn(
              "flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 bg-well text-ink-3 transition-colors",
              "hover:bg-raised hover:text-ink-2",
            )}
          >
            <ImagePlus className="h-5 w-5" aria-hidden />
            <span className="text-[11px] font-medium">Choose image</span>
          </button>
        )}
      </div>

      {hint ? <p className="text-[11px] leading-snug text-ink-3">{hint}</p> : null}
    </div>
  );
}
