"use client";

import { useState } from "react";

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

export default function DownloadAssetButton({
  url,
  filenamePrefix,
  label = "Download original",
}: {
  url: string;
  filenamePrefix: string;
  label?: string;
}) {
  const [downloading, setDownloading] = useState(false);

  function stopEvent(event: React.SyntheticEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  async function onDownload(event: React.MouseEvent<HTMLButtonElement>) {
    stopEvent(event);

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
      a.rel = "noopener";
      a.style.display = "none";

      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 1000);
    } catch (error) {
      console.error("[DownloadAssetButton] download failed", error);
      alert("Download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button
      type="button"
      onMouseDown={stopEvent}
      onClick={onDownload}
      disabled={downloading}
      className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {downloading ? "Downloading..." : label}
    </button>
  );
}
