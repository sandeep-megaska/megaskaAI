import { type AIBackend } from "@/lib/ai-backends";

export type VideoProvider = "gemini-api";

type VideoProviderModelConfig = {
  provider: VideoProvider;
  modelId: string;
};

const GEMINI_VIDEO_MODEL_BY_BACKEND_ID: Record<string, string> = {
  "veo-2": "veo-2.0-generate-001",
  "veo-3": "veo-3.0-generate-001",
  "veo-3-fast": "veo-3.0-fast-generate-001",
  "veo-3.1": "veo-3.1-generate-preview",
  "veo-3.1-fast": "veo-3.1-fast-generate-preview",
};

export function resolveVideoProviderModel(backend: AIBackend): VideoProviderModelConfig {
  return {
    provider: "gemini-api",
    modelId: GEMINI_VIDEO_MODEL_BY_BACKEND_ID[backend.id] ?? backend.model,
  };
}
