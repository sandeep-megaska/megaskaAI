"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Aspect-correct thumbnail for generated assets.
 *
 * Gallery cards used to force every image into a 16:9 box, so 3:4 portrait
 * generations — the studio's most common output — were cropped through the
 * subject. `ratio` now follows the asset, and `object-contain` on a dark mat
 * guarantees nothing is cut off when the ratio is unknown.
 *
 * These are Supabase-hosted assets rendered straight from their public URLs, so
 * they intentionally bypass next/image: the optimiser would add a proxy hop and
 * per-image cost for files the provider already encoded for delivery. Lazy
 * loading and async decoding keep a long gallery cheap to scroll.
 */
export default function MediaFrame({
  src,
  alt,
  ratio = "square",
  fit = "cover",
  className,
  priority = false,
}: {
  src: string | null | undefined;
  alt: string;
  ratio?: "square" | "portrait" | "landscape" | "video" | "auto";
  fit?: "cover" | "contain";
  className?: string;
  /** Skip lazy loading for the one asset that is above the fold. */
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const ratioClass =
    ratio === "square"
      ? "aspect-square"
      : ratio === "portrait"
        ? "aspect-[3/4]"
        : ratio === "landscape"
          ? "aspect-[4/3]"
          : ratio === "video"
            ? "aspect-video"
            : "";

  return (
    <div className={cn("relative overflow-hidden bg-well", ratioClass, className)}>
      {src && !failed ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- see component doc */}
          <img
            src={src}
            alt={alt}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={cn(
              "h-full w-full transition-opacity duration-300",
              fit === "cover" ? "object-cover" : "object-contain",
              loaded ? "opacity-100" : "opacity-0",
            )}
          />
          {!loaded ? <div className="absolute inset-0 animate-pulse bg-raised" aria-hidden /> : null}
        </>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-ink-3">
          <ImageOff className="h-5 w-5" aria-hidden />
          <span className="text-[11px]">{failed ? "Preview unavailable" : "No preview"}</span>
        </div>
      )}
    </div>
  );
}
