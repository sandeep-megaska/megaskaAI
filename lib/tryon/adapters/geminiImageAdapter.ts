import { GoogleGenAI } from "@google/genai";
import { mapGeminiProviderError } from "@/lib/ai/providerErrors";
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

function buildPrompt(input: AdapterInput) {
  const parts: string[] = [input.prompt];

  if (input.negativePrompt) {
    parts.push(`Avoid: ${input.negativePrompt}`);
  }

  if (input.adapterPayload?.compiledPrompt) {
    parts.push(`Compiled orchestration context:\n${input.adapterPayload.compiledPrompt}`);
  }

  const references = [
    ...(input.adapterPayload?.selectedReferences?.bundle?.silhouetteReferences ?? []),
    ...(input.adapterPayload?.selectedReferences?.bundle?.detailReferences ?? []),
    ...(input.adapterPayload?.selectedReferences?.bundle?.fabricPrintReferences ?? []),
  ];

  if (references.length) {
    parts.push(`Reference image URLs:\n${references.map((url) => `- ${url}`).join("\n")}`);
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
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_API_KEY environment variable.");

  const selectedModel = input.model ?? DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await ai.models.generateImages({
        model: selectedModel,
        prompt: buildPrompt(input),
        config: {
          numberOfImages: 1,
          aspectRatio: input.aspectRatio ?? "1:1",
        },
      });

      const image = response.generatedImages?.[0]?.image;
      if (!image?.imageBytes) {
        throw new Error("Gemini image try-on returned no image bytes.");
      }

      return {
        bytes: Buffer.from(image.imageBytes, "base64"),
        mimeType: image.mimeType ?? "image/png",
        model: selectedModel,
      };
    } catch (error) {
      if (attempt === 0) {
        const message = String((error as { message?: string })?.message ?? "").toUpperCase();
        if (message.includes("UNAVAILABLE") || message.includes("503")) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
      }

      mapGeminiProviderError(error);
    }
  }

  throw new Error("Gemini image try-on request failed after retry.");
}
