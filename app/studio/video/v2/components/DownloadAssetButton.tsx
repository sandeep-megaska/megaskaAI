"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const DOWNLOAD_ROUTE = "/api/studio/video/v2/assets/download";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);

function inferFileName(url: string, fallbackPrefix: string) {
  try {
    const parsed = new URL(url);
    const lastSegment = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    if (lastSegment.includes(".")) return decodeURIComponent(lastSegment);
  } catch {
    // ignore parse failures
  }
  return `${fallbackPrefix}.bin`;
}

function getExtensionFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const lastSegment = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    const extension = lastSegment.split(".").pop()?.toLowerCase() ?? "";
    return extension;
  } catch {
    return "";
  }
}

function getBaseFileName(filename: string) {
  const index = filename.lastIndexOf(".");
  if (index <= 0) return filename;
  return filename.slice(0, index);
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const blobUrl = window.URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    window.URL.revokeObjectURL(blobUrl);
  }, 1000);
}

async function loadImageToCanvas(url: string) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error(`Image fetch failed (${response.status})`);
  }

  const sourceBlob = await response.blob();
  const sourceObjectUrl = window.URL.createObjectURL(sourceBlob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.decoding = "async";
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Unsupported image format"));
      nextImage.src = sourceObjectUrl;
    });

    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("Image dimensions unavailable");
    }

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas rendering unavailable");
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    window.URL.revokeObjectURL(sourceObjectUrl);
  }
}

async function exportCanvasBlob(canvas: HTMLCanvasElement, type: "image/jpeg" | "image/png") {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Image conversion failed"));
          return;
        }
        resolve(blob);
      },
      type,
      type === "image/jpeg" ? 0.92 : undefined,
    );
  });
}

export default function DownloadAssetButton({
  url,
  filenamePrefix,
  label = "Download",
  mimeType,
}: {
  url: string;
  filenamePrefix: string;
  label?: string;
  mimeType?: string | null;
}) {
  const [downloading, setDownloading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isImageAsset = useMemo(() => {
    const extension = getExtensionFromUrl(url);
    const extensionLooksImage = extension ? IMAGE_EXTENSIONS.has(extension) : false;
    const mimeLooksImage = Boolean(mimeType && mimeType.toLowerCase().startsWith("image/"));
    return extensionLooksImage || mimeLooksImage;
  }, [mimeType, url]);

  useEffect(() => {
    if (!menuOpen) return;

    function onDocumentMouseDown(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function onEscKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    window.addEventListener("mousedown", onDocumentMouseDown);
    window.addEventListener("keydown", onEscKey);
    return () => {
      window.removeEventListener("mousedown", onDocumentMouseDown);
      window.removeEventListener("keydown", onEscKey);
    };
  }, [menuOpen]);

  function stopEvent(event: React.SyntheticEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  async function downloadOriginal() {
    const filename = inferFileName(url, filenamePrefix);

    const params = new URLSearchParams({
      asset_url: url,
      filename,
    });

    const href = `${DOWNLOAD_ROUTE}?${params.toString()}`;
    const response = await fetch(href, {
      method: "GET",
      credentials: "same-origin",
    });

    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`);
    }

    const blob = await response.blob();
    triggerBlobDownload(blob, filename);
  }

  async function downloadConvertedImage(format: "jpg" | "png") {
    const originalName = inferFileName(url, filenamePrefix);
    const baseName = getBaseFileName(originalName) || filenamePrefix;
    const targetFilename = `${baseName}.${format}`;

    const canvas = await loadImageToCanvas(url);
    const targetType = format === "jpg" ? "image/jpeg" : "image/png";
    const blob = await exportCanvasBlob(canvas, targetType);

    triggerBlobDownload(blob, targetFilename);
  }

  async function onSelectOption(option: "original" | "jpg" | "png") {
    try {
      setErrorMessage(null);
      setDownloading(true);
      setMenuOpen(false);

      if (!url) {
        throw new Error("Missing asset URL");
      }

      if (option === "original") {
        await downloadOriginal();
        return;
      }

      await downloadConvertedImage(option);
    } catch (error) {
      console.error("[DownloadAssetButton] download failed", error);
      setErrorMessage("Download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div ref={containerRef} className="relative inline-flex flex-col items-start" onMouseDown={stopEvent} onClick={stopEvent}>
      <div className="inline-flex overflow-hidden rounded border border-zinc-700 bg-zinc-950 text-xs shadow-sm shadow-black/40">
        <button
          type="button"
          onClick={() => onSelectOption("original")}
          disabled={downloading}
          className="px-2 py-1 text-zinc-100 transition hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {downloading ? "Downloading..." : label}
        </button>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
          disabled={downloading}
          className="border-l border-zinc-700 px-2 py-1 text-zinc-300 transition hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
          title="Download options"
        >
          ▾
        </button>
      </div>

      {menuOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.375rem)] z-20 min-w-44 rounded-lg border border-zinc-700 bg-zinc-950/95 p-1 text-xs shadow-xl shadow-black/50 backdrop-blur"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => onSelectOption("original")}
            className="block w-full rounded-md px-2 py-1.5 text-left text-zinc-100 transition hover:bg-zinc-900"
          >
            Download original
          </button>
          {isImageAsset ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => onSelectOption("jpg")}
                className="block w-full rounded-md px-2 py-1.5 text-left text-zinc-100 transition hover:bg-zinc-900"
              >
                Download as JPG
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => onSelectOption("png")}
                className="block w-full rounded-md px-2 py-1.5 text-left text-zinc-100 transition hover:bg-zinc-900"
              >
                Download as PNG
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {errorMessage ? <p className="mt-1 text-[11px] text-rose-300">{errorMessage}</p> : null}
    </div>
  );
}
