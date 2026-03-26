export function getAssetUrl(item?: { asset_url?: string | null; url?: string | null } | null) {
  return item?.asset_url ?? item?.url ?? null;
}

function pickFirstUrl(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  }
  return null;
}

function walkForVideoUrl(node: unknown, depth = 0): string | null {
  if (!node || depth > 6) return null;
  if (typeof node === "string") {
    const trimmed = node.trim();
    return trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : null;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = walkForVideoUrl(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;
  const record = node as Record<string, unknown>;
  const direct = pickFirstUrl([
    record.output_asset_url,
    record.asset_url,
    record.video_url,
    record.url,
    record.output_url,
    record.download_url,
    record.downloadUri,
    record.uri,
  ]);
  if (direct) return direct;
  for (const value of Object.values(record)) {
    const found = walkForVideoUrl(value, depth + 1);
    if (found) return found;
  }
  return null;
}

export function resolveRunVideoUrl(run?: { output_asset_url?: string | null; request_payload_snapshot?: Record<string, unknown> | null; run_meta?: Record<string, unknown> | null } | null) {
  if (!run) return null;
  const direct = pickFirstUrl([run.output_asset_url]);
  if (direct) return direct;
  const snapshot = walkForVideoUrl(run.request_payload_snapshot);
  if (snapshot) return snapshot;
  return walkForVideoUrl(run.run_meta);
}


export function resolveRunPrompt(run?: { request_payload_snapshot?: Record<string, unknown> | null; run_meta?: Record<string, unknown> | null; prompt_used?: string | null } | null) {
  if (!run) return null;
  const fromSnapshot = run.request_payload_snapshot?.director_prompt;
  if (typeof fromSnapshot === "string" && fromSnapshot.trim()) return fromSnapshot.trim();
  if (typeof run.prompt_used === "string" && run.prompt_used.trim()) return run.prompt_used.trim();
  const fromMeta = run.run_meta?.prompt_used;
  if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.trim();
  return null;
}

export function shortId(id: string) {
  return id.slice(0, 8);
}

export function excerpt(text?: string | null, max = 90) {
  if (!text) return "No prompt captured.";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function statusTone(status: string) {
  if (status === "validated") return "text-emerald-300";
  if (status === "succeeded" || status === "completed") return "text-emerald-200";
  if (status === "running") return "text-sky-300";
  if (status === "queued" || status === "planned") return "text-amber-200";
  if (status === "failed") return "text-rose-300";
  return "text-zinc-300";
}

export function sequenceStatusTone(status: string) {
  if (status === "ready") return "text-emerald-300";
  if (status === "rendering") return "text-sky-300";
  if (status === "exported") return "text-emerald-200";
  if (status === "failed") return "text-rose-300";
  return "text-zinc-300";
}

export function sequenceStatusLabel(status: string) {
  if (status === "ready") return "Ready";
  if (status === "rendering") return "Rendering";
  if (status === "exported") return "Exported";
  if (status === "failed") return "Failed";
  return "Draft";
}
