import { findBackendById, getDefaultBackendForType } from "@/lib/ai-backends";
import { isGeminiImageModel, isImagenModel } from "@/lib/ai/backendFamilies";
import { runGoogleImageTryOn } from "@/lib/tryon/adapters/googleImageAdapter";
import { runGeminiImageConditionedTryOn } from "@/lib/tryon/adapters/geminiImageConditionedTryOn";

export type TryOnAdapterPayload = {
  subject?: {
    sourceMode?: "model_library" | "manual_upload";
    modelId?: string | null;
    personAssetUrl?: string | null;
  } & Record<string, unknown>;
  garment?: Record<string, unknown>;
  selectedReferences?: {
    selectedAssetIds?: string[];
    primaryFrontAssetId?: string | null;
    primaryBackAssetId?: string | null;
    categoryDefiningAssetIds?: string[];
    constructionDetailAssetIds?: string[];
    silhouetteCriticalAssetIds?: string[];
    printCriticalAssetIds?: string[];
    bundle?: {
      silhouetteReferences?: string[];
      detailReferences?: string[];
      fabricPrintReferences?: string[];
    };
    subjectModelAssetUrls?: string[];
  } & Record<string, unknown>;
  garmentAssets?: Array<{
    id: string;
    public_url: string;
    asset_type: string;
    detail_zone?: string | null;
    view_label?: string | null;
    sort_order?: number | null;
  }>;
  compiledPrompt?: string;
  negativePrompt?: string;
  workflowProfile?: Record<string, unknown>;
  hardPreservationRules?: Record<string, unknown>;
  printPreservationRules?: Record<string, unknown>;
  forbiddenTransformations?: string[];
} & Record<string, unknown>;

export type RunTryOnInput = {
  backendId?: string | null;
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: "1:1" | "16:9" | "9:16";
  adapterPayload?: TryOnAdapterPayload;
};

export type RunTryOnResult = {
  bytes: Buffer;
  mimeType: string;
  backendId: string;
  backendModel: string;
  debug?: Record<string, unknown>;
  warnings?: string[];
};

export async function runTryOnJob(input: RunTryOnInput): Promise<RunTryOnResult> {
  const backend = findBackendById(input.backendId) ?? getDefaultBackendForType("image");

  if (backend.type !== "image") {
    throw new Error("Try-on currently supports image backends only.");
  }

  const adapterInput = {
    model: backend.model,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    aspectRatio: input.aspectRatio,
    adapterPayload: input.adapterPayload,
  };

  let output: {
    bytes: Buffer;
    mimeType: string;
    model: string;
    debug?: Record<string, unknown>;
    warnings?: string[];
  };

  if (isGeminiImageModel(backend.model)) {
    output = await runGeminiImageConditionedTryOn(adapterInput);
  } else if (isImagenModel(backend.model)) {
    output = await runGoogleImageTryOn(adapterInput);
  } else {
    throw new Error(`Unsupported try-on image backend family for model '${backend.model}'.`);
  }

  return {
    bytes: output.bytes,
    mimeType: output.mimeType,
    backendId: backend.id,
    backendModel: output.model,
    debug: output.debug,
    warnings: output.warnings,
  };
}
