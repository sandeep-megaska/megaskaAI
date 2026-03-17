import { GoogleGenAI } from "@google/genai";
import { mapGeminiProviderError } from "@/lib/ai/providerErrors";

type AspectRatio = "1:1" | "16:9" | "9:16";

type ImagenInput = {
  apiKey?: string;
  model: string;
  prompt: string;
  aspectRatio?: AspectRatio;
  referenceUrls?: string[];
};

type ImagenOutput = {
  bytes: Buffer;
  mimeType: string;
  model: string;
};

function buildPrompt(prompt: string, referenceUrls: string[]) {
  if (!referenceUrls.length) {
    return prompt;
  }

  return `${prompt}\n\nReference image URLs:\n${referenceUrls.map((url) => `- ${url}`).join("\n")}`;
}

export async function runImagenImageGeneration(input: ImagenInput): Promise<ImagenOutput> {
  const apiKey = input.apiKey ?? process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY or GEMINI_API_KEY environment variable.");
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateImages({
      model: input.model,
      prompt: buildPrompt(input.prompt, input.referenceUrls ?? []),
      config: {
        numberOfImages: 1,
        aspectRatio: input.aspectRatio ?? "1:1",
      },
    });

    const image = response.generatedImages?.[0]?.image;
    if (!image?.imageBytes) {
      throw new Error("Imagen generation returned no image bytes.");
    }

    return {
      bytes: Buffer.from(image.imageBytes, "base64"),
      mimeType: image.mimeType ?? "image/png",
      model: input.model,
    };
  } catch (error) {
    mapGeminiProviderError(error);
  }
}
