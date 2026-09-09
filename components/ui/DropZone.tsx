"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { cn } from "@/lib/cn";
import MediaFrame from "./MediaFrame";

/**
 * Reference-image uploader.
 *
 * Replaces a bare `<input type="file">` that gave no feedback at all: you could
 * not tell what had uploaded, how many, or whether it was still going. This
 * accepts a drop or a click, shows every uploaded thumbnail, and lets you
 * remove one without starting over.
 */
export default function DropZone({
  label,
  hint,
  urls,
  onFiles,
  onRemove,
  uploading = false,
  accept = "image/*",
  className,
}: {
  label: string;
  hint?: string;
  urls: string[];
  onFiles: (files: FileList | null) => void;
  onRemove?: (url: string) => void;
  uploading?: boolean;
  accept?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const inputId = useId();
  const hintId = `${inputId}-hint`;

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (uploading) return;
    onFiles(event.dataTransfer.files);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink">{label}</span>
        {urls.length ? (
          <span className="text-xs tabular-nums text-ink-3">
            {urls.length} added
          </span>
        ) : null}
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "rounded-xl border border-dashed p-3 transition-colors",
          dragging ? "border-accent bg-accent/5" : "border-line-strong bg-well",
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          multiple
          disabled={uploading}
          aria-label={label}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => {
            onFiles(event.target.files);
            // Allow re-selecting the same file after a removal.
            event.target.value = "";
          }}
          className="sr-only"
        />

        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm transition-colors",
            "text-ink-2 hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="h-4 w-4" aria-hidden />
          )}
          {uploading ? "Uploading…" : "Drop images here, or browse"}
        </button>

        {urls.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {urls.map((url, index) => (
              <li key={url} className="relative">
                <MediaFrame
                  src={url}
                  alt={`${label} ${index + 1}`}
                  ratio="square"
                  className="h-16 w-16 rounded-lg border border-line"
                />
                {onRemove ? (
                  <button
                    type="button"
                    onClick={() => onRemove(url)}
                    aria-label={`Remove ${label} ${index + 1}`}
                    className="absolute -right-1.5 -top-1.5 rounded-full border border-line-strong bg-raised p-1 text-ink-2 transition-colors hover:border-danger/60 hover:text-danger"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {hint ? (
        <p id={hintId} className="text-xs leading-relaxed text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
