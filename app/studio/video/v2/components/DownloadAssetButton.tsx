"use client";

import { useState, type MouseEvent } from "react";

const DOWNLOAD_ROUTE = "/api/studio/video/v2/assets/download";

function inferFileName(url: string, fallbackPrefix: string) {
  try {
    const parsed = new URL(url);
    const lastSegment = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    if (lastSegment.includes(".")) return lastSegment;
  } catch {
    // ignore parse failures
  }
  return `${fallbackPrefix}.bin`;
}

export default function DownloadAssetButton({ url, filenamePrefix, label = "Download original" }: { url: string; filenamePrefix: string; label?: string }) {
  const [downloading, setDownloading] = useState(false);

  async function onDownload(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    try {
      setDownloading(true);

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
      const blobUrl = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;

      document.body.appendChild(a);
      a.click();
      a.remove();

      window.setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 1000);
    } catch (error) {
      console.error("Download failed", error);
      alert("Download failed. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onDownload}
      disabled={downloading}
      className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {label}
    </button>
  );
}
