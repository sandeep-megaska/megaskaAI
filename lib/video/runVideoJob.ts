import { findBackendById, getDefaultBackendForType } from "@/lib/ai-backends";
import { isVeoModel } from "@/lib/ai/backendFamilies";
import { type StudioAspectRatio } from "@/lib/studio/aspectRatios";
import { runVeoVideo } from "@/lib/video/adapters/runVeoVideo";

export type RunVideoJobInput = {
  apiKey?: string;
  backendId?: string | null;
  prompt: string;
  durationSeconds: number;
  referenceImageUrls: string[];
  aspectRatio?: StudioAspectRatio;
};

export type RunVideoJobResult = {
  bytes: Buffer;
  mimeType: string;
  backendId: string;
  backendModel: string;
  rawOutputUri: string | null;
};

function getAllowedDurationsForVeoModel(model: string): readonly number[] {
  const normalized = model.trim().toLowerCase();

  if (normalized.startsWith("veo-3.1")) {
    return [4, 6, 8] as const;
  }

  if (normalized.startsWith("veo-3")) {
    return [8] as const;
  }

  if (normalized.startsWith("veo-2")) {
    return [5, 6, 7, 8] as const;
  }

  return [8] as const;
}

export async function runVideoJob(input: RunVideoJobInput): Promise<RunVideoJobResult> {
  const requestedBackend = findBackendById(input.backendId);
  if (input.backendId && !requestedBackend) {
    throw new Error("Unknown ai_backend_id.");
  }

  const backend = requestedBackend ?? getDefaultBackendForType("video");

  if (backend.type !== "video") {
    throw new Error(`Backend '${backend.id}' supports ${backend.type} only.`);
  }

  if (!isVeoModel(backend.model)) {
    throw new Error(`Unsupported video backend family for model '${backend.model}'.`);
  }

  const allowedDurations = getAllowedDurationsForVeoModel(backend.model);
  if (!allowedDurations.includes(input.durationSeconds)) {
    throw new Error(
      `Unsupported duration_seconds for backend '${backend.id}'. Supported values: ${allowedDurations.join(", ")}.`,
    );
  }

  const output = await runVeoVideo({
    apiKey: input.apiKey,
    model: backend.model,
    prompt: input.prompt,
    referenceImageUrls: input.referenceImageUrls,
    aspectRatio: input.aspectRatio,
    durationSeconds: input.durationSeconds,
  });

  return {
    bytes: output.bytes,
    mimeType: output.mimeType,
    backendId: backend.id,
    backendModel: output.model,
    rawOutputUri: output.rawOutputUri,
  };
}
