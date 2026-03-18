import { findBackendById, getDefaultBackendForType, type AIBackend, type AIBackendType } from "@/lib/ai-backends";
import { isGeminiImageModel, isImagenModel, isVeoModel } from "@/lib/ai/backendFamilies";
import { runGeminiImageGeneration } from "@/lib/ai/adapters/geminiImageAdapter";
import { runImagenImageGeneration } from "@/lib/ai/adapters/imagenImageAdapter";
import { runVeoVideoGeneration } from "@/lib/ai/adapters/veoVideoAdapter";
import { type StudioAspectRatio } from "@/lib/studio/aspectRatios";

export type StudioGenerationType = "image" | "video";

export type RunStudioGenerationInput = {
  apiKey?: string;
  type: StudioGenerationType;
  prompt: string;
  aspectRatio?: StudioAspectRatio;
  backendId?: string | null;
  referenceUrls?: string[];
};

export type RunStudioGenerationResult = {
  bytes: Buffer;
  mimeType: string;
  backend: AIBackend;
  backendModel: string;
  mediaType: "Image" | "Video";
};

function resolveBackend(type: StudioGenerationType, backendId?: string | null) {
  const requestedBackend = findBackendById(backendId);
  if (backendId && !requestedBackend) {
    throw new Error("Unknown ai_backend_id.");
  }

  const backend = requestedBackend ?? getDefaultBackendForType(type as AIBackendType);
  if (backend.type !== type) {
    throw new Error(`Backend '${backend.id}' supports ${backend.type} only.`);
  }

  return backend;
}

export async function runStudioGeneration(input: RunStudioGenerationInput): Promise<RunStudioGenerationResult> {
  const backend = resolveBackend(input.type, input.backendId);

  if (input.type === "image") {
    if (isGeminiImageModel(backend.model)) {
      const output = await runGeminiImageGeneration({
        apiKey: input.apiKey,
        model: backend.model,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        referenceUrls: input.referenceUrls,
      });

      return {
        bytes: output.bytes,
        mimeType: output.mimeType,
        backend,
        backendModel: output.model,
        mediaType: "Image",
      };
    }

    if (isImagenModel(backend.model)) {
      const output = await runImagenImageGeneration({
        apiKey: input.apiKey,
        model: backend.model,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        referenceUrls: input.referenceUrls,
      });

      return {
        bytes: output.bytes,
        mimeType: output.mimeType,
        backend,
        backendModel: output.model,
        mediaType: "Image",
      };
    }

    throw new Error(`Unsupported image backend family for model '${backend.model}'.`);
  }

  if (!isVeoModel(backend.model)) {
    throw new Error(`Unsupported video backend family for model '${backend.model}'.`);
  }

  const output = await runVeoVideoGeneration({
    apiKey: input.apiKey,
    model: backend.model,
    prompt: input.prompt,
    aspectRatio: input.aspectRatio,
  });

  return {
    bytes: output.bytes,
    mimeType: output.mimeType,
    backend,
    backendModel: output.model,
    mediaType: "Video",
  };
}
