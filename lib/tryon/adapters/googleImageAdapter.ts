import { GoogleGenAI } from "@google/genai";

type AdapterInput = {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: "1:1" | "16:9" | "9:16";
  model?: string;
};

type AdapterOutput = {
  bytes: Buffer;
  mimeType: string;
  model: string;
};

export async function runGoogleImageTryOn(input: AdapterInput): Promise<AdapterOutput> {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY environment variable.");
  }

  const selectedModel = input.model ?? "imagen-4.0-generate-001";
  const ai = new GoogleGenAI({ apiKey });

  const mergedPrompt = input.negativePrompt
    ? `${input.prompt}\n\nAvoid: ${input.negativePrompt}`
    : input.prompt;

  const response = await ai.models.generateImages({
    model: selectedModel,
    prompt: mergedPrompt,
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
}
