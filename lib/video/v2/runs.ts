import type { AnchorPack, DirectorPlanContract, VideoRunStatus } from "@/lib/video/v2/types";

export function normalizeRunStatus(status?: string | null): VideoRunStatus {
  if (status === "planned" || status === "queued" || status === "running" || status === "succeeded" || status === "failed" || status === "validated" || status === "completed") {
    return status;
  }
  return "queued";
}

export function deriveProviderFromPlan(plan: DirectorPlanContract) {
  const providerSelected = plan.provider_order[0] ?? "veo-3.1";
  return {
    providerSelected,
    modelSelected: providerSelected,
  };
}

export function deriveFallbackProviderFromPlan(plan: DirectorPlanContract, currentProvider?: string | null) {
  const providers = plan.provider_order ?? [];
  if (!providers.length) return null;
  if (!currentProvider) return providers[1] ?? null;
  const currentIndex = providers.findIndex((entry) => entry === currentProvider);
  if (currentIndex < 0) return providers[0] ?? null;
  return providers[currentIndex + 1] ?? null;
}

export function resolvePrimaryFrameUrl(pack?: AnchorPack | null) {
  if (!pack?.anchor_pack_items?.length) return null;
  const preferredRoles = ["start_frame", "front", "fit_anchor"];
  for (const role of preferredRoles) {
    const found = pack.anchor_pack_items.find((item) => item.role === role);
    const url = found?.generation?.asset_url ?? found?.generation?.url ?? null;
    if (url) return url;
  }
  const fallback = pack.anchor_pack_items.find((item) => item.generation?.asset_url || item.generation?.url);
  return fallback?.generation?.asset_url ?? fallback?.generation?.url ?? null;
}
