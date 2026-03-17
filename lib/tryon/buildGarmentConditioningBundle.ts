import type { GarmentAssetRecord } from "@/lib/tryon/types";
import type { TryOnAdapterPayload } from "@/lib/tryon/runTryOnJob";

type ConditioningImage = {
  url: string;
  role: string;
  assetId?: string;
};

function dedupeByUrl(images: ConditioningImage[]) {
  const seen = new Set<string>();
  const output: ConditioningImage[] = [];

  for (const image of images) {
    if (seen.has(image.url)) continue;
    seen.add(image.url);
    output.push(image);
  }

  return output;
}

function findAssetsById(assets: GarmentAssetRecord[], ids: string[] | undefined, role: string) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const idSet = new Set(ids);
  return assets.filter((asset) => idSet.has(asset.id)).map((asset) => ({
    url: asset.public_url,
    role,
    assetId: asset.id,
  }));
}

export function buildGarmentConditioningBundle(input: {
  selectedReferences?: TryOnAdapterPayload["selectedReferences"];
  garmentAssets?: TryOnAdapterPayload["garmentAssets"];
}) {
  const garmentAssets = (input.garmentAssets ?? []) as GarmentAssetRecord[];

  const frontImages = findAssetsById(garmentAssets, input.selectedReferences?.primaryFrontAssetId ? [input.selectedReferences.primaryFrontAssetId] : [], "garment_front_primary");
  const backImages = findAssetsById(garmentAssets, input.selectedReferences?.primaryBackAssetId ? [input.selectedReferences.primaryBackAssetId] : [], "garment_back_primary");
  const categoryDefiningImages = findAssetsById(garmentAssets, input.selectedReferences?.categoryDefiningAssetIds, "garment_category_defining");
  const constructionDetailImages = findAssetsById(garmentAssets, input.selectedReferences?.constructionDetailAssetIds, "garment_construction_detail");
  const silhouetteCriticalImages = findAssetsById(garmentAssets, input.selectedReferences?.silhouetteCriticalAssetIds, "garment_silhouette_critical");
  const printCriticalImages = findAssetsById(garmentAssets, input.selectedReferences?.printCriticalAssetIds, "garment_print_critical");

  const fallbackBundleUrls = [
    ...(input.selectedReferences?.bundle?.silhouetteReferences ?? []),
    ...(input.selectedReferences?.bundle?.detailReferences ?? []),
    ...(input.selectedReferences?.bundle?.fabricPrintReferences ?? []),
  ].map((url) => ({ url, role: "garment_reference_bundle_fallback" }));

  const orderedConditioningImages = dedupeByUrl([
    ...frontImages,
    ...backImages,
    ...categoryDefiningImages,
    ...constructionDetailImages,
    ...silhouetteCriticalImages,
    ...printCriticalImages,
    ...fallbackBundleUrls,
  ]);

  return {
    frontImages: dedupeByUrl(frontImages),
    backImages: dedupeByUrl(backImages),
    categoryDefiningImages: dedupeByUrl(categoryDefiningImages),
    constructionDetailImages: dedupeByUrl(constructionDetailImages),
    silhouetteCriticalImages: dedupeByUrl(silhouetteCriticalImages),
    printCriticalImages: dedupeByUrl(printCriticalImages),
    orderedConditioningImages,
  };
}
