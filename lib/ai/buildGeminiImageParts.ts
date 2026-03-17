import { loadImageReference } from "@/lib/ai/loadImageReference";

export type GeminiConditioningReference = {
  url: string;
  role: string;
  assetId?: string;
};

export type GeminiInlineImagePart = {
  inlineData: {
    data: string;
    mimeType: string;
  };
};

export type GeminiImagePartsBuildResult = {
  imageParts: GeminiInlineImagePart[];
  usedReferenceAssetIds: string[];
  failedReferences: Array<{ url: string; role?: string; assetId?: string; reason: string }>;
  loadedReferences: Array<{ url: string; role: string; assetId?: string; mimeType: string }>;
};

export async function buildGeminiImageParts(input: { references: GeminiConditioningReference[]; maxImages?: number }): Promise<GeminiImagePartsBuildResult> {
  const unique = new Map<string, GeminiConditioningReference>();
  for (const ref of input.references) {
    const key = `${ref.url}::${ref.role}`;
    if (!unique.has(key)) unique.set(key, ref);
  }

  const selected = Array.from(unique.values()).slice(0, input.maxImages ?? 10);
  const imageParts: GeminiInlineImagePart[] = [];
  const usedReferenceAssetIds = new Set<string>();
  const failedReferences: GeminiImagePartsBuildResult["failedReferences"] = [];
  const loadedReferences: GeminiImagePartsBuildResult["loadedReferences"] = [];

  for (const reference of selected) {
    const result = await loadImageReference(reference);
    if (!result.ok) {
      failedReferences.push({
        url: result.url,
        role: result.role,
        assetId: result.assetId,
        reason: result.reason,
      });
      continue;
    }

    imageParts.push({
      inlineData: {
        data: result.image.base64Data,
        mimeType: result.image.mimeType,
      },
    });

    if (result.image.assetId) usedReferenceAssetIds.add(result.image.assetId);
    loadedReferences.push({
      url: result.image.url,
      role: result.image.role ?? "reference",
      assetId: result.image.assetId,
      mimeType: result.image.mimeType,
    });
  }

  return {
    imageParts,
    usedReferenceAssetIds: Array.from(usedReferenceAssetIds),
    failedReferences,
    loadedReferences,
  };
}
