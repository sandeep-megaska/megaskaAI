import {
  ConstraintProfile,
  GarmentAssetRecord,
  GarmentReferenceBundle,
  WorkflowProfile,
} from "@/lib/tryon/types";

type ReferenceSelectionResult = {
  selectedAssetIds: string[];
  primaryFrontAssetId: string | null;
  primaryBackAssetId: string | null;
  detailAssetIds: string[];
  categoryDefiningAssetIds: string[];
  constructionDetailAssetIds: string[];
  silhouetteCriticalAssetIds: string[];
  printCriticalAssetIds: string[];
  printDistributionAssetIds: string[];
  printDetailAssetIds: string[];
  missingPrintCriticalReferences: string[];
  missingIdentityCriticalReferences: string[];
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

function isPrintDetail(asset: GarmentAssetRecord) {
  const zone = (asset.detail_zone ?? "").toLowerCase();
  const label = (asset.view_label ?? "").toLowerCase();
  return ["print", "fabric", "texture"].includes(zone)
    || ["print", "pattern", "fabric", "texture", "floral"].some((token) => label.includes(token));
}

export function selectGarmentReferencePack(input: {
  assets: GarmentAssetRecord[];
  primaryFrontAssetId?: string | null;
  primaryBackAssetId?: string | null;
  constraintProfile: ConstraintProfile;
  workflowProfile?: WorkflowProfile;
  printLockEnabled?: boolean;
}): ReferenceSelectionResult {
  const assets = sortAssets(input.assets ?? []);
  const detailAssets = assets.filter((asset) => asset.asset_type === "detail" || asset.asset_type === "reference");
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

  const catalogMode = input.workflowProfile?.workflowMode === "catalog_fidelity";
  const printCriticalMode = Boolean(input.printLockEnabled) || catalogMode || input.constraintProfile.preservePrint;

  const prioritizedDetails: GarmentAssetRecord[] = [];
  const includeDetail = (asset: GarmentAssetRecord | undefined, reason: string) => {
    if (!asset || selected.has(asset.id) || prioritizedDetails.some((item) => item.id === asset.id)) return;
    prioritizedDetails.push(asset);
    reasoning.push(reason);
  };

  if (printCriticalMode) {
    includeDetail(findByZone(detailAssets, ["print", "fabric", "texture"]), "Added print/fabric detail due to print-critical mode.");
  }
  if (input.constraintProfile.preserveNeckline) {
    includeDetail(findByZone(detailAssets, ["neckline", "bust"]), "Added neckline/bust detail due to preserve_neckline constraint.");
  }
  if (input.constraintProfile.preserveSleeveShape) {
    includeDetail(findByZone(detailAssets, ["sleeve", "strap"]), "Added sleeve/strap detail due to preserve_sleeve_shape constraint.");
  }
  if (input.constraintProfile.preserveLength) {
    includeDetail(findByZone(detailAssets, ["hem", "length", "skirt"]), "Added hem/length detail due to preserve_length constraint.");
  }

  if (catalogMode) {
    includeDetail(findByZone(detailAssets, ["neckline", "bust", "waist"]), "Catalog fidelity: prioritize construction-defining details.");
  }

  for (const printAsset of detailAssets.filter(isPrintDetail).slice(0, printCriticalMode ? 3 : 1)) {
    includeDetail(printAsset, "Prioritized additional print/fabric detail for pattern identity coverage.");
  }

  const detailLimit = printCriticalMode ? 7 : catalogMode ? 6 : 4;
  for (const asset of prioritizedDetails.slice(0, detailLimit)) {
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
  const detailAssetIds = selectedAssets.filter((asset) => asset.asset_type === "detail" || asset.asset_type === "reference").map((asset) => asset.id);

  const printDistributionAssetIds = selectedAssets
    .filter((asset) => asset.asset_type === "front" || asset.asset_type === "back" || (asset.view_label ?? "").toLowerCase().includes("distribution"))
    .map((asset) => asset.id);
  const printDetailAssetIds = selectedAssets.filter(isPrintDetail).map((asset) => asset.id);

  const missingCriticalReferences: string[] = [];
  if (!primaryFront) missingCriticalReferences.push("primary_front");
  if (input.constraintProfile.preserveLength && !primaryBack) missingCriticalReferences.push("primary_back");
  if (input.constraintProfile.preserveNeckline && !findByZone(detailAssets, ["neckline", "bust"])) missingCriticalReferences.push("neckline_or_bust_detail");
  if (printCriticalMode && !findByZone(detailAssets, ["print", "fabric", "texture"])) missingCriticalReferences.push("print_or_fabric_detail");

  const missingPrintCriticalReferences: string[] = [];
  if (!primaryFront) missingPrintCriticalReferences.push("front_print_distribution_view");
  if (!primaryBack) missingPrintCriticalReferences.push("back_print_distribution_view");
  if (!printDetailAssetIds.length) missingPrintCriticalReferences.push("close_print_or_texture_detail");

  const silhouetteCriticalAssetIds = [primaryFront?.id, primaryBack?.id].filter((value): value is string => Boolean(value));
  const constructionDetailAssetIds = selectedAssets
    .filter((asset) => ["neckline", "bust", "waist", "sleeve", "strap", "hem", "length", "skirt"].includes((asset.detail_zone ?? "").toLowerCase()))
    .map((asset) => asset.id);
  const printCriticalAssetIds = Array.from(new Set([...printDistributionAssetIds, ...printDetailAssetIds]));

  const bundle: GarmentReferenceBundle = {
    silhouetteReferences: selectedAssets
      .filter((asset) => asset.asset_type === "front" || asset.asset_type === "back" || asset.id === primaryFront?.id || asset.id === primaryBack?.id)
      .map((asset) => asset.public_url),
    detailReferences: selectedAssets
      .filter((asset) => asset.asset_type === "detail" || asset.asset_type === "reference")
      .map((asset) => asset.public_url),
    fabricPrintReferences: selectedAssets
      .filter(isPrintDetail)
      .map((asset) => asset.public_url),
    preservationPriorities: input.constraintProfile.preservationPriority,
  };

  return {
    selectedAssetIds: selectedAssets.map((asset) => asset.id),
    primaryFrontAssetId: primaryFront?.id ?? null,
    primaryBackAssetId: primaryBack?.id ?? null,
    detailAssetIds,
    categoryDefiningAssetIds: silhouetteCriticalAssetIds,
    constructionDetailAssetIds,
    silhouetteCriticalAssetIds,
    printCriticalAssetIds,
    printDistributionAssetIds,
    printDetailAssetIds,
    missingPrintCriticalReferences,
    missingIdentityCriticalReferences: missingCriticalReferences,
    bundle,
    debug: {
      reasoning,
      missingCriticalReferences,
      constraintSignals: {
        preservationPriority: input.constraintProfile.preservationPriority,
        allowedVariationLevel: input.constraintProfile.allowedVariationLevel,
        compositionIntent: input.constraintProfile.compositionIntent,
        workflowMode: input.workflowProfile?.workflowMode ?? "standard_tryon",
        printCriticalMode,
      },
    },
  };
}
