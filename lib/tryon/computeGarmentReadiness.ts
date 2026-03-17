import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { GarmentAssetRecord } from "@/lib/tryon/types";
import { computePrintReadiness } from "@/lib/tryon/computePrintReadiness";

export type GarmentReadinessStatus = "draft" | "reference_incomplete" | "tryon_ready" | "archived";

export type GarmentReadinessSummary = {
  hasFront: boolean;
  hasBack: boolean;
  hasNeckline: boolean;
  hasSleeveOrStrap: boolean;
  hasHem: boolean;
  hasPrintOrFabric: boolean;
  totalAssets: number;
  missing: string[];
};

export type GarmentReadinessResult = {
  readinessScore: number;
  readinessStatus: GarmentReadinessStatus;
  referenceSummary: GarmentReadinessSummary;
};

function hasZone(assets: GarmentAssetRecord[], zones: string[]) {
  const target = zones.map((zone) => zone.toLowerCase());
  return assets.some((asset) => target.includes((asset.detail_zone ?? "").toLowerCase()));
}

export function computeGarmentReadiness(input: {
  garmentStatus?: string | null;
  assets: GarmentAssetRecord[];
  primaryFrontAssetId?: string | null;
  primaryBackAssetId?: string | null;
}): GarmentReadinessResult {
  const assets = input.assets ?? [];
  const hasFront = assets.some((asset) => asset.id === input.primaryFrontAssetId)
    || assets.some((asset) => asset.asset_type === "front");
  const hasBack = assets.some((asset) => asset.id === input.primaryBackAssetId)
    || assets.some((asset) => asset.asset_type === "back");
  const hasNeckline = hasZone(assets, ["neckline"]);
  const hasSleeveOrStrap = hasZone(assets, ["sleeve", "strap"]);
  const hasHem = hasZone(assets, ["hem", "length"]);
  const hasPrintOrFabric = hasZone(assets, ["print", "fabric"])
    || assets.some((asset) => (asset.asset_type === "detail") && ["print", "fabric"].some((term) => (asset.view_label ?? "").toLowerCase().includes(term)));

  let score = 0;
  if (hasFront) score += 30;
  if (hasBack) score += 20;
  if (hasNeckline) score += 10;
  if (hasSleeveOrStrap) score += 10;
  if (hasHem) score += 10;
  if (hasPrintOrFabric) score += 10;
  if (assets.length >= 4) score += 10;

  const missing: string[] = [];
  if (!hasFront) missing.push("primary_front");
  if (!hasBack) missing.push("primary_back");
  if (!hasNeckline) missing.push("neckline_detail");
  if (!hasSleeveOrStrap) missing.push("sleeve_or_strap_detail");
  if (!hasHem) missing.push("hem_or_length_detail");
  if (!hasPrintOrFabric) missing.push("print_or_fabric_detail");

  const normalizedStatus = (input.garmentStatus ?? "").toLowerCase();
  let readinessStatus: GarmentReadinessStatus = "reference_incomplete";
  if (normalizedStatus === "archived") {
    readinessStatus = "archived";
  } else if (normalizedStatus === "draft") {
    readinessStatus = score >= 70 ? "reference_incomplete" : "draft";
  } else if (score >= 70 && hasFront) {
    readinessStatus = "tryon_ready";
  }

  return {
    readinessScore: Math.max(0, Math.min(100, score)),
    readinessStatus,
    referenceSummary: {
      hasFront,
      hasBack,
      hasNeckline,
      hasSleeveOrStrap,
      hasHem,
      hasPrintOrFabric,
      totalAssets: assets.length,
      missing,
    },
  };
}

export async function recomputeAndPersistGarmentReadiness(input: {
  garmentId: string;
  garmentStatus?: string | null;
  primaryFrontAssetId?: string | null;
  primaryBackAssetId?: string | null;
  assets?: GarmentAssetRecord[];
}) {
  const supabase = getSupabaseAdminClient();
  let assets = input.assets;

  if (!assets) {
    const { data: garmentAssets } = await supabase
      .from("garment_assets")
      .select("id,asset_type,public_url,detail_zone,view_label,is_primary,sort_order")
      .eq("garment_id", input.garmentId)
      .order("sort_order", { ascending: true });
    assets = (garmentAssets ?? []) as GarmentAssetRecord[];
  }

  const readiness = computeGarmentReadiness({
    garmentStatus: input.garmentStatus,
    primaryFrontAssetId: input.primaryFrontAssetId,
    primaryBackAssetId: input.primaryBackAssetId,
    assets,
  });

  const printReadiness = computePrintReadiness({
    assets,
    primaryFrontAssetId: input.primaryFrontAssetId,
    primaryBackAssetId: input.primaryBackAssetId,
  });

  await supabase
    .from("garment_library")
    .update({
      readiness_score: readiness.readinessScore,
      readiness_status: readiness.readinessStatus,
      reference_summary: readiness.referenceSummary,
      print_readiness_score: printReadiness.printReadinessScore,
      print_readiness_status: printReadiness.printReadinessStatus,
      print_reference_summary: printReadiness.printReferenceSummary,
    })
    .eq("id", input.garmentId);

  return { ...readiness, printReadiness };
}
