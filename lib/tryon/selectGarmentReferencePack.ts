import { ConstraintProfile, GarmentAssetRecord, GarmentReferenceBundle } from "@/lib/tryon/types";

type ReferenceSelectionResult = {
  selectedAssetIds: string[];
  primaryFrontAssetId: string | null;
  primaryBackAssetId: string | null;
  detailAssetIds: string[];
  bundle: GarmentReferenceBundle;
  debug: {
    reasoning: string[];
    missingCriticalReferences: string[];
    constraintSignals: Record<string, boolean | string | string[]>;
  };
};

function sortAssets(assets: GarmentAssetRecord[]) {
  return [...assets].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function findByZone(assets: GarmentAssetRecord[], zones: string[]) {
  const lower = zones.map((zone) => zone.toLowerCase());
  return sortAssets(assets).find((asset) => lower.includes((asset.detail_zone ?? "").toLowerCase()));
}

export function selectGarmentReferencePack(input: {
  assets: GarmentAssetRecord[];
  primaryFrontAssetId?: string | null;
  primaryBackAssetId?: string | null;
  constraintProfile: ConstraintProfile;
}): ReferenceSelectionResult {
  const assets = sortAssets(input.assets ?? []);
  const detailAssets = assets.filter((asset) => asset.asset_type === "detail");
  const selected = new Set<string>();
  const reasoning: string[] = [];

  const primaryFront = assets.find((asset) => asset.id === input.primaryFrontAssetId)
    ?? assets.find((asset) => asset.asset_type === "front")
    ?? null;
  const primaryBack = assets.find((asset) => asset.id === input.primaryBackAssetId)
    ?? assets.find((asset) => asset.asset_type === "back")
    ?? null;

  if (primaryFront) {
    selected.add(primaryFront.id);
    reasoning.push("Selected primary front reference as top silhouette anchor.");
  }
  if (primaryBack) {
    selected.add(primaryBack.id);
    reasoning.push("Selected back reference to retain rear construction and length behavior.");
  }

  const prioritizedDetails: GarmentAssetRecord[] = [];
  const includeDetail = (asset: GarmentAssetRecord | undefined, reason: string) => {
    if (!asset || selected.has(asset.id) || prioritizedDetails.some((item) => item.id === asset.id)) return;
    prioritizedDetails.push(asset);
    reasoning.push(reason);
  };

  if (input.constraintProfile.preservePrint) {
    includeDetail(findByZone(detailAssets, ["print", "fabric"]), "Added print/fabric detail due to preserve_print constraint.");
  }
  if (input.constraintProfile.preserveNeckline) {
    includeDetail(findByZone(detailAssets, ["neckline"]), "Added neckline detail due to preserve_neckline constraint.");
  }
  if (input.constraintProfile.preserveSleeveShape) {
    includeDetail(findByZone(detailAssets, ["sleeve", "strap"]), "Added sleeve/strap detail due to preserve_sleeve_shape constraint.");
  }
  if (input.constraintProfile.preserveLength) {
    includeDetail(findByZone(detailAssets, ["hem", "length"]), "Added hem/length detail due to preserve_length constraint.");
  }
  if (input.constraintProfile.preserveColor) {
    includeDetail(findByZone(detailAssets, ["fabric", "print", "color"]), "Added color-supporting detail due to preserve_color constraint.");
  }

  for (const asset of prioritizedDetails.slice(0, 4)) {
    selected.add(asset.id);
  }

  if (selected.size < 2) {
    for (const fallback of assets) {
      if (selected.size >= 2) break;
      selected.add(fallback.id);
      reasoning.push("Fallback reference added to ensure minimum bundle coverage.");
    }
  }

  const selectedAssets = assets.filter((asset) => selected.has(asset.id));
  const detailAssetIds = selectedAssets.filter((asset) => asset.asset_type === "detail").map((asset) => asset.id);

  const missingCriticalReferences: string[] = [];
  if (!primaryFront) missingCriticalReferences.push("primary_front");
  if (input.constraintProfile.preserveLength && !primaryBack) missingCriticalReferences.push("primary_back");
  if (input.constraintProfile.preserveNeckline && !findByZone(detailAssets, ["neckline"])) missingCriticalReferences.push("neckline_detail");
  if (input.constraintProfile.preservePrint && !findByZone(detailAssets, ["print", "fabric"])) missingCriticalReferences.push("print_or_fabric_detail");

  const bundle: GarmentReferenceBundle = {
    silhouetteReferences: selectedAssets
      .filter((asset) => asset.asset_type === "front" || asset.asset_type === "back" || asset.id === primaryFront?.id || asset.id === primaryBack?.id)
      .map((asset) => asset.public_url),
    detailReferences: selectedAssets
      .filter((asset) => asset.asset_type === "detail")
      .map((asset) => asset.public_url),
    fabricPrintReferences: selectedAssets
      .filter((asset) => ["print", "fabric"].includes((asset.detail_zone ?? "").toLowerCase()))
      .map((asset) => asset.public_url),
    preservationPriorities: input.constraintProfile.preservationPriority,
  };

  return {
    selectedAssetIds: selectedAssets.map((asset) => asset.id),
    primaryFrontAssetId: primaryFront?.id ?? null,
    primaryBackAssetId: primaryBack?.id ?? null,
    detailAssetIds,
    bundle,
    debug: {
      reasoning,
      missingCriticalReferences,
      constraintSignals: {
        preservationPriority: input.constraintProfile.preservationPriority,
        allowedVariationLevel: input.constraintProfile.allowedVariationLevel,
        compositionIntent: input.constraintProfile.compositionIntent,
      },
    },
  };
}
