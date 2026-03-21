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

export default function DownloadAssetButton({ url, filenamePrefix, label = "Download original" }: { url: string; filenamePrefix: string; label?: string }) {
  const [downloading, setDownloading] = useState(false);

  function onDownload() {
    try {
      setDownloading(true);
      const filename = inferFileName(url, filenamePrefix);
      const params = new URLSearchParams({
        asset_url: url,
        filename,
      });
      const href = `${DOWNLOAD_ROUTE}?${params.toString()}`;
      const a = document.createElement("a");
      a.href = href;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button type="button" onClick={onDownload} disabled={downloading} className="rounded border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-900 disabled:opacity-40">
      {downloading ? "Downloading..." : label}
    </button>
  );
}
