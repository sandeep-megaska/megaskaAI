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

function buildPrompt(input: AdapterInput) {
  const referenceUrls = [
    ...(input.adapterPayload?.selectedReferences?.bundle?.silhouetteReferences ?? []),
    ...(input.adapterPayload?.selectedReferences?.bundle?.detailReferences ?? []),
    ...(input.adapterPayload?.selectedReferences?.bundle?.fabricPrintReferences ?? []),
  ];

  const mergedPrompt = input.negativePrompt ? `${input.prompt}\n\nAvoid: ${input.negativePrompt}` : input.prompt;
  if (!referenceUrls.length) return mergedPrompt;

  return `${mergedPrompt}\n\nReference image URLs:\n${referenceUrls.map((url) => `- ${url}`).join("\n")}`;
}

export async function runGoogleImageTryOn(input: AdapterInput): Promise<AdapterOutput> {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY environment variable.");
  }

  const selectedModel = input.model ?? "imagen-4.0-generate-001";
  const ai = new GoogleGenAI({ apiKey });

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
      throw new Error("Try-on image backend returned no image bytes.");
    }

    return {
      bytes: Buffer.from(image.imageBytes, "base64"),
      mimeType: image.mimeType ?? "image/png",
      model: selectedModel,
    };
  } catch (error) {
    mapGeminiProviderError(error);
  }
}
