import { type VideoProviderCapability } from "@/lib/video/providerCapabilities";

export type VideoReferenceSelectionInput = {
  workflow: "fidelity-baseline" | "multi-reference";
  fitAnchorUrl?: string | null;
  identityAnchorUrl?: string | null;
  garmentAnchorUrl?: string | null;
  allReferenceUrls: string[];
  maxReferenceImages: number;
};

function normalizeUrlForComparison(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return trimmed.split(/[?#]/, 1)[0] ?? trimmed;
  }
}

function pushUnique(urls: string[], value?: string | null) {
  const normalized = normalizeUrlForComparison(value);
  if (!normalized) return;
  if (urls.some((item) => normalizeUrlForComparison(item) === normalized)) return;
  urls.push(value!.trim());
}

export function selectReferenceSubset(input: VideoReferenceSelectionInput) {
  const dedupedAll: string[] = [];
  for (const url of input.allReferenceUrls) pushUnique(dedupedAll, url);

  const selected: string[] = [];
  const dropped: Array<{ url: string; reason: string }> = [];

  if (input.workflow === "fidelity-baseline") {
    pushUnique(selected, input.fitAnchorUrl);
    pushUnique(selected, input.identityAnchorUrl);
    pushUnique(selected, input.garmentAnchorUrl);
  } else {
    pushUnique(selected, input.identityAnchorUrl);
    pushUnique(selected, input.fitAnchorUrl);
    pushUnique(selected, input.garmentAnchorUrl);
    for (const url of dedupedAll) pushUnique(selected, url);
  }

  for (const url of dedupedAll) pushUnique(selected, url);

  const bounded = selected.slice(0, input.maxReferenceImages);
  for (const url of selected.slice(input.maxReferenceImages)) {
    dropped.push({ url, reason: `Exceeded provider reference limit (${input.maxReferenceImages}).` });
  }

  for (const url of dedupedAll) {
    if (!bounded.some((value) => normalizeUrlForComparison(value) === normalizeUrlForComparison(url))) {
      dropped.push({ url, reason: "Not selected in prioritized subset." });
    }
  }

  return {
    selectedUrls: bounded,
    dropped,
    dedupedAll,
  };
}

export function computeMaxReferences(capability: VideoProviderCapability) {
  if (!capability.supportsReferenceImages) return 0;
  return Math.max(0, capability.maxReferenceImages);
}
