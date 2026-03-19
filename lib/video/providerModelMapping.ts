import { type AIBackend } from "@/lib/ai-backends";
import { resolveVideoCapability, type VideoProvider } from "@/lib/video/providerCapabilities";

type VideoProviderModelConfig = {
  provider: VideoProvider;
  modelId: string;
};

export function resolveVideoProviderModel(backend: AIBackend): VideoProviderModelConfig {
  const capability = resolveVideoCapability(backend);
  return {
    provider: capability.provider,
    modelId: capability.providerModelId,
  };
}
