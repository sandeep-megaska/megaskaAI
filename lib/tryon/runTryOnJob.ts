import { findBackendById, getDefaultBackendForType } from "@/lib/ai-backends";
import { runGoogleImageTryOn } from "@/lib/tryon/adapters/googleImageAdapter";
import { runGeminiNanoBananaProTryOn } from "@/lib/tryon/adapters/geminiNanoBananaPro";

export type TryOnAdapterPayload = {
  subject?: Record<string, unknown>;
  garment?: Record<string, unknown>;
  selectedReferences?: {
    bundle?: {
      silhouetteReferences?: string[];
      detailReferences?: string[];
      fabricPrintReferences?: string[];
    };
  } & Record<string, unknown>;
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

  const output =
    backend.id === "nano-banana-pro"
      ? await runGeminiNanoBananaProTryOn(adapterInput)
      : await runGoogleImageTryOn(adapterInput);

  return {
    bytes: output.bytes,
    mimeType: output.mimeType,
    backendId: backend.id,
    backendModel: output.model,
  };
}
