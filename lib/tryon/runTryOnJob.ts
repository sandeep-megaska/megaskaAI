import { findBackendById, getDefaultBackendForType } from "@/lib/ai-backends";
import { isGeminiImageModel, isImagenModel, isVeoModel } from "@/lib/ai/backendFamilies";
import { runGeminiImageTryOn } from "@/lib/tryon/adapters/geminiImageTryOn";
import { runImagenGenerate } from "@/lib/tryon/adapters/imagenGenerate";
import { runVeoTryOnVideo } from "@/lib/tryon/adapters/veoTryOnVideo";
import type { TryOnExecutionPayload, TryOnReferenceImage, TryOnConstraintProfile } from "@/lib/tryon/types";
import { createHash } from "crypto";

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

export type BackendFamily = "gemini-image" | "imagen" | "veo" | "unknown";

export function getBackendCapabilities(model: string): {
  family: BackendFamily;
  supportsImageTryOn: boolean;
  supportsVideoTryOn: boolean;
} {
  if (isGeminiImageModel(model)) {
    return { family: "gemini-image", supportsImageTryOn: true, supportsVideoTryOn: false };
  }

  if (isImagenModel(model)) {
    return { family: "imagen", supportsImageTryOn: false, supportsVideoTryOn: false };
  }

  if (isVeoModel(model)) {
    return { family: "veo", supportsImageTryOn: false, supportsVideoTryOn: true };
  }

  return { family: "unknown", supportsImageTryOn: false, supportsVideoTryOn: false };
}

function normalizeReferences(payload?: TryOnAdapterPayload): TryOnReferenceImage[] {
  const references: TryOnReferenceImage[] = [];

  for (const url of payload?.selectedReferences?.subjectModelAssetUrls ?? []) {
    if (url) references.push({ kind: "subject", url });
  }

  if (payload?.subject?.personAssetUrl) {
    references.push({ kind: "subject", url: String(payload.subject.personAssetUrl) });
  }

  const byId = new Map((payload?.garmentAssets ?? []).map((asset) => [asset.id, asset]));
  const toRef = (assetId: string | null | undefined, fallbackKind: TryOnReferenceImage["kind"]) => {
    if (!assetId) return null;
    const asset = byId.get(assetId);
    if (!asset?.public_url) return null;
    return { kind: fallbackKind, url: asset.public_url, assetId: asset.id } satisfies TryOnReferenceImage;
  };

  for (const assetId of payload?.selectedReferences?.silhouetteCriticalAssetIds ?? []) {
    const ref = toRef(assetId, "garment_silhouette");
    if (ref) references.push(ref);
  }
  for (const assetId of payload?.selectedReferences?.constructionDetailAssetIds ?? []) {
    const ref = toRef(assetId, "garment_detail");
    if (ref) references.push(ref);
  }
  for (const assetId of payload?.selectedReferences?.printCriticalAssetIds ?? []) {
    const ref = toRef(assetId, "garment_print");
    if (ref) references.push(ref);
  }

  if (!references.some((item) => item.kind !== "subject")) {
    for (const asset of payload?.garmentAssets ?? []) {
      if (asset?.public_url) {
        references.push({ kind: "garment_silhouette", url: asset.public_url, assetId: asset.id });
      }
    }
  }

  return references;
}

function buildConstraintProfile(payload?: TryOnAdapterPayload): TryOnConstraintProfile {
  const hardRules = payload?.hardPreservationRules ?? {};
  const printRules = payload?.printPreservationRules ?? {};
  const workflowProfile = payload?.workflowProfile ?? {};

  return {
    noReconstruction: true,
    preserveStructure: Boolean((hardRules as Record<string, unknown>).preserveGarmentCategory ?? true),
    preservePrintPlacement: Boolean((hardRules as Record<string, unknown>).preservePrintPlacement ?? (printRules as Record<string, unknown>).preservePrintDistribution ?? true),
    preserveColorway: Boolean((hardRules as Record<string, unknown>).preserveColorFamily ?? (printRules as Record<string, unknown>).preserveColorFamily ?? true),
    preserveSilhouette: Boolean((hardRules as Record<string, unknown>).preserveSilhouette ?? true),
    allowPoseAdaptation: Boolean((workflowProfile as Record<string, unknown>).shouldAllowPoseVariation ?? false),
    allowFitAdaptation: true,
    allowPerspectiveAdaptation: true,
  };
}

function buildPromptHash(prompt: string, negativePrompt?: string) {
  return createHash("sha256").update(`${prompt}\n${negativePrompt ?? ""}`).digest("hex");
}

export async function runTryOnJob(input: RunTryOnInput): Promise<RunTryOnResult> {
  const backend =
    findBackendById(input.backendId) ??
    findBackendById("nano-banana-pro") ??
    getDefaultBackendForType("image");

  const capabilities = getBackendCapabilities(backend.model);
  const workflowMode = (input.adapterPayload?.workflowProfile as { workflowMode?: string } | undefined)?.workflowMode ?? "standard_tryon";
  const references = normalizeReferences(input.adapterPayload);
  const constraintProfile = buildConstraintProfile(input.adapterPayload);

  const debugTrace = {
    backendModel: backend.model,
    backendFamily: capabilities.family,
    referenceKinds: Array.from(new Set(references.map((item) => item.kind))),
    promptHash: buildPromptHash(input.prompt, input.negativePrompt),
    noReconstruction: constraintProfile.noReconstruction,
    preservationFlags: {
      preserveStructure: constraintProfile.preserveStructure,
      preservePrintPlacement: constraintProfile.preservePrintPlacement,
      preserveColorway: constraintProfile.preserveColorway,
      preserveSilhouette: constraintProfile.preserveSilhouette,
    },
  };

  const executionPayload: TryOnExecutionPayload = {
    workflowMode: workflowMode as TryOnExecutionPayload["workflowMode"],
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    aspectRatio: input.aspectRatio,
    backendModel: backend.model,
    references,
    compiledPrompt: input.adapterPayload?.compiledPrompt,
    constraints: constraintProfile,
    debugTrace,
  };

  let output: {
    bytes: Buffer;
    mimeType: string;
    model: string;
    imageBase64?: string;
    imageUrl?: string | null;
    provider?: Record<string, unknown>;
    rawResponseExcerpt?: Record<string, unknown>;
    debug?: Record<string, unknown>;
    warnings?: string[];
  };

  switch (capabilities.family) {
    case "gemini-image":
      output = await runGeminiImageTryOn(executionPayload);
      break;
    case "imagen":
      output = await runImagenGenerate({
        model: backend.model,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
        aspectRatio: input.aspectRatio,
        workflowMode,
      });
      break;
    case "veo":
      await runVeoTryOnVideo({ workflowMode });
      throw new Error("Veo try-on video workflow is not yet implemented.");
    default:
      throw new Error(`Unsupported try-on backend family for model '${backend.model}'.`);
  }

  return {
    bytes: output.bytes,
    mimeType: output.mimeType,
    backendId: backend.id,
    backendModel: output.model,
    debug: {
      ...debugTrace,
      provider: output.provider ?? null,
      rawResponseExcerpt: output.rawResponseExcerpt ?? null,
      imageBase64Length: output.imageBase64?.length ?? null,
      imageUrl: output.imageUrl ?? null,
      ...(output.debug ?? {}),
    },
    warnings: output.warnings,
  };
}
