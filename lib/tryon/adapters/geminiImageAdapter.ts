import { runGeminiImageGeneration } from "@/lib/ai/adapters/geminiImageAdapter";
import type { TryOnAdapterPayload } from "@/lib/tryon/runTryOnJob";

type AdapterInput = {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: "1:1" | "16:9" | "9:16";
  model?: string;
  adapterPayload?: TryOnAdapterPayload;
};

type AdapterOutput = {
  bytes: Buffer;
  mimeType: string;
  model: string;
};

const DEFAULT_MODEL = "gemini-3-pro-image-preview";

function collectReferenceUrls(input: AdapterInput) {
  return [
    ...(input.adapterPayload?.selectedReferences?.bundle?.silhouetteReferences ?? []),
    ...(input.adapterPayload?.selectedReferences?.bundle?.detailReferences ?? []),
    ...(input.adapterPayload?.selectedReferences?.bundle?.fabricPrintReferences ?? []),
  ];
}

function buildPrompt(input: AdapterInput) {
  const parts: string[] = [input.prompt];

  if (input.negativePrompt) {
    parts.push(`Avoid: ${input.negativePrompt}`);
  }

  if (input.adapterPayload?.compiledPrompt) {
    parts.push(`Compiled orchestration context:\n${input.adapterPayload.compiledPrompt}`);
  }

  if (input.adapterPayload?.hardPreservationRules) {
    parts.push(`Hard preservation rules: ${JSON.stringify(input.adapterPayload.hardPreservationRules)}`);
  }

  if (input.adapterPayload?.printPreservationRules) {
    parts.push(`Print preservation rules: ${JSON.stringify(input.adapterPayload.printPreservationRules)}`);
  }

  if (input.adapterPayload?.forbiddenTransformations?.length) {
    parts.push(`Forbidden transformations:\n${input.adapterPayload.forbiddenTransformations.map((item) => `- ${item}`).join("\n")}`);
  }

  return parts.join("\n\n");
}

export async function runGeminiImageTryOn(input: AdapterInput): Promise<AdapterOutput> {
  const selectedModel = input.model ?? DEFAULT_MODEL;

  return runGeminiImageGeneration({
    model: selectedModel,
    prompt: buildPrompt(input),
    aspectRatio: input.aspectRatio,
    referenceUrls: collectReferenceUrls(input),
  });
}
