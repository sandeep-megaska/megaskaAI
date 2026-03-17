import { GarmentAssetRecord, PrintReadinessResult } from "@/lib/tryon/types";

function textHasAny(value: string | null | undefined, needles: string[]) {
  const normalized = (value ?? "").toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

function zoneIs(asset: GarmentAssetRecord, zones: string[]) {
  return zones.includes((asset.detail_zone ?? "").toLowerCase());
}

export function computePrintReadiness(input: {
  garment?: { printType?: string | null; colorway?: string | null };
  assets: GarmentAssetRecord[];
  primaryFrontAssetId?: string | null;
  primaryBackAssetId?: string | null;
}): PrintReadinessResult {
  const assets = input.assets ?? [];
  const primaryFront = assets.find((asset) => asset.id === input.primaryFrontAssetId)
    ?? assets.find((asset) => asset.asset_type === "front")
    ?? null;
  const primaryBack = assets.find((asset) => asset.id === input.primaryBackAssetId)
    ?? assets.find((asset) => asset.asset_type === "back")
    ?? null;

  const detailAssets = assets.filter((asset) => asset.asset_type === "detail" || asset.asset_type === "reference");
  const printDetails = detailAssets.filter((asset) => zoneIs(asset, ["print", "fabric", "texture"]) || textHasAny(asset.view_label, ["print", "pattern", "fabric", "texture", "floral"]));
  const textureDetails = detailAssets.filter((asset) => zoneIs(asset, ["fabric", "texture"]) || textHasAny(asset.view_label, ["texture", "weave", "fabric"]));
  const distributionViews = assets.filter((asset) => {
    if (asset.asset_type === "front" || asset.asset_type === "back") return true;
    return textHasAny(asset.view_label, ["full", "mid", "distribution", "body"]);
  });

  const hasFrontPrintView = Boolean(primaryFront) || assets.some((asset) => asset.asset_type === "front");
  const hasBackPrintView = Boolean(primaryBack) || assets.some((asset) => asset.asset_type === "back");
  const hasClosePrintDetail = printDetails.length > 0;
  const hasFabricTextureDetail = textureDetails.length > 0;
  const hasDistributionView = distributionViews.length > 1;

  const totalPrintRelevantAssets = assets.filter((asset) => asset.asset_type === "front"
      || asset.asset_type === "back"
      || zoneIs(asset, ["print", "fabric", "texture"])
      || textHasAny(asset.view_label, ["print", "pattern", "fabric", "texture", "full", "distribution"])).length;

  let printReadinessScore = 0;
  if (hasFrontPrintView) printReadinessScore += 25;
  if (hasBackPrintView) printReadinessScore += 15;
  if (hasClosePrintDetail) printReadinessScore += 25;
  if (hasFabricTextureDetail) printReadinessScore += 10;
  if (hasDistributionView) printReadinessScore += 15;
  if (totalPrintRelevantAssets >= 4) printReadinessScore += 10;

  const isLikelyPrinted = textHasAny(input.garment?.printType, ["print", "floral", "pattern", "stripe", "multi", "paisley"])
    || textHasAny(input.garment?.colorway, ["multi", "floral", "print"]);

  if (!isLikelyPrinted && printReadinessScore > 80) {
    printReadinessScore = 80;
  }

  const missing: string[] = [];
  if (!hasFrontPrintView) missing.push("front_print_view");
  if (!hasBackPrintView) missing.push("back_print_view");
  if (!hasClosePrintDetail) missing.push("close_print_detail");
  if (!hasFabricTextureDetail) missing.push("fabric_texture_detail");
  if (!hasDistributionView) missing.push("print_distribution_view");

  const clampedScore = Math.max(0, Math.min(100, printReadinessScore));
  const printReadinessStatus = clampedScore >= 75
    ? "print_reference_strong"
    : clampedScore >= 45
      ? "print_reference_medium"
      : "print_reference_weak";

  return {
    printReadinessScore: clampedScore,
    printReadinessStatus,
    printReferenceSummary: {
      hasFrontPrintView,
      hasBackPrintView,
      hasClosePrintDetail,
      hasFabricTextureDetail,
      hasDistributionView,
      totalPrintRelevantAssets,
      missing,
    },
  };
}
