"use client";

import { useState } from "react";

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

  async function onDownload() {
    try {
      setDownloading(true);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch asset for download.");
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = inferFileName(url, filenamePrefix);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
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
