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

function rankSourceKind(sourceKind: string | null | undefined) {
  if (sourceKind === "manual_verified_override") return 100;
  if (sourceKind === "sku_verified_truth") return 95;
  if (sourceKind === "user_uploaded") return 85;
  if (sourceKind === "reused_existing") return 70;
  if (sourceKind === "expanded_generated") return 60;
  if (sourceKind === "synthesized_support") return 50;
  if (sourceKind === "synthesized") return 40;
  return 20;
}

function resolveByGenerationId(pack: AnchorPack | null | undefined, generationId: string | null | undefined) {
  if (!pack?.anchor_pack_items?.length || !generationId) return null;
  const item = pack.anchor_pack_items.find((entry) => entry.generation_id === generationId);
  return item?.generation?.asset_url ?? item?.generation?.url ?? null;
}

export function resolveBestFrameUrlByRole(pack: AnchorPack | null | undefined, role: string | null | undefined) {
  if (!pack?.anchor_pack_items?.length || !role) return null;
  const candidates = pack.anchor_pack_items
    .filter((item) => item.role === role)
    .sort((a, b) => rankSourceKind((b as unknown as { source_kind?: string }).source_kind ?? null) - rankSourceKind((a as unknown as { source_kind?: string }).source_kind ?? null));
  const best = candidates.find((item) => item.generation?.asset_url || item.generation?.url);
  return best?.generation?.asset_url ?? best?.generation?.url ?? null;
}

export function resolveRuntimeFrameUrls(input: {
  pack: AnchorPack | null | undefined;
  startFrameGenerationId?: string | null;
  endFrameGenerationId?: string | null;
  startFrameRole?: string | null;
  endFrameRole?: string | null;
}) {
  const startFrameUrl =
    resolveByGenerationId(input.pack, input.startFrameGenerationId)
    ?? resolveBestFrameUrlByRole(input.pack, input.startFrameRole ?? "front")
    ?? resolvePrimaryFrameUrl(input.pack);
  const endFrameUrl =
    resolveByGenerationId(input.pack, input.endFrameGenerationId)
    ?? resolveBestFrameUrlByRole(input.pack, input.endFrameRole ?? null);
  return { startFrameUrl, endFrameUrl };
}
