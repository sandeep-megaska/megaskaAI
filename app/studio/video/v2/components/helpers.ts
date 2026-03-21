export function getAssetUrl(item?: { asset_url?: string | null; url?: string | null } | null) {
  return item?.asset_url ?? item?.url ?? null;
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
