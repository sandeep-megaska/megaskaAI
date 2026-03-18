import { GoogleGenAI } from "@google/genai";
import { mapGeminiProviderError } from "@/lib/ai/providerErrors";

type ImagenGenerateInput = {
  model: string;
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: "1:1" | "16:9" | "9:16";
  workflowMode?: string;
};

type ImagenGenerateOutput = {
  bytes: Buffer;
  mimeType: string;
  model: string;
  debug?: Record<string, unknown>;
};

const TRY_ON_BLOCK_ERROR = "Imagen backend is not allowed for Megaska try-on fidelity mode. Use a Gemini image backend.";

export async function runImagenGenerate(input: ImagenGenerateInput): Promise<ImagenGenerateOutput> {
  if (input.workflowMode === "standard_tryon" || input.workflowMode === "catalog_fidelity") {
    throw new Error(TRY_ON_BLOCK_ERROR);
  }

  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY environment variable.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const mergedPrompt = input.negativePrompt ? `${input.prompt}\n\nAvoid: ${input.negativePrompt}` : input.prompt;

  try {
    const response = await ai.models.generateImages({
      model: input.model,
      prompt: mergedPrompt,
      config: {
        numberOfImages: 1,
        aspectRatio: input.aspectRatio ?? "1:1",
      },
    });

    const image = response.generatedImages?.[0]?.image;

    if (!image?.imageBytes) {
      throw new Error("Imagen backend returned no image bytes.");
    }

    return {
      bytes: Buffer.from(image.imageBytes, "base64"),
      mimeType: image.mimeType ?? "image/png",
      model: input.model,
      debug: { workflowMode: input.workflowMode ?? null },
    };
  } catch (error) {
    mapGeminiProviderError(error);
  }
}

export { TRY_ON_BLOCK_ERROR as IMAGEN_TRY_ON_BLOCK_ERROR };
