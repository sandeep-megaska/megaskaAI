import { isGeminiImageModel, isImagenModel, isVeoModel } from "@/lib/ai/backendFamilies";
import { runGeminiImageTryOn } from "@/lib/tryon/adapters/geminiImageTryOn";
import type { LookbookExecutionPayload, LookbookShotResult } from "@/lib/lookbook/types";
import type { TryOnExecutionPayload } from "@/lib/tryon/types";

function mapReferences(payload: LookbookExecutionPayload): TryOnExecutionPayload["references"] {
  return payload.references.map((reference) => {
    if (reference.kind === "model_identity") {
      return { kind: "subject", url: reference.url, assetId: reference.assetId, label: reference.label };
    }

    if (reference.kind === "garment_detail") {
      return { kind: "garment_detail", url: reference.url, assetId: reference.assetId, label: reference.label };
    }

    return { kind: "garment_silhouette", url: reference.url, assetId: reference.assetId, label: reference.label };
  });
}

export async function runGeminiLookbookShot(payload: LookbookExecutionPayload): Promise<LookbookShotResult> {
  if (isImagenModel(payload.backendModel)) {
    throw new Error("Consistent Lookbook does not support Imagen backends. Please choose a Gemini image backend.");
  }

  if (isVeoModel(payload.backendModel)) {
    throw new Error("Consistent Lookbook does not support Veo backends. Please choose a Gemini image backend.");
  }

  if (!isGeminiImageModel(payload.backendModel)) {
    throw new Error(`Consistent Lookbook requires Gemini image family backends. Received '${payload.backendModel}'.`);
  }

  const response = await runGeminiImageTryOn({
    workflowMode: payload.workflowMode,
    prompt: payload.prompt,
    backendModel: payload.backendModel,
    aspectRatio: payload.shot.aspectRatio,
    references: mapReferences(payload),
    constraints: {
      noReconstruction: payload.constraints.noReconstruction,
      preserveStructure: payload.constraints.preserveGarmentStructure,
      preservePrintPlacement: payload.constraints.preservePrintPlacement,
      preserveColorway: payload.constraints.preserveColorway,
      preserveSilhouette: payload.constraints.preserveSilhouette,
      allowPoseAdaptation: true,
      allowFitAdaptation: false,
      allowPerspectiveAdaptation: true,
    },
    compiledPrompt: payload.prompt,
    debugTrace: payload.debugTrace,
  });

  return {
    shot: payload.shot,
    bytes: response.bytes,
    mimeType: response.mimeType,
    backendModel: response.model,
    warnings: response.warnings,
    debugTrace: {
      ...(payload.debugTrace ?? {}),
      provider: response.provider,
      rawResponseExcerpt: response.rawResponseExcerpt,
      adapterDebug: response.debug,
    },
  };
}
