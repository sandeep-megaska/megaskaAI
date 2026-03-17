import { GoogleGenAI } from "@google/genai";
import { mapGeminiProviderError } from "@/lib/ai/providerErrors";

type AspectRatio = "1:1" | "16:9" | "9:16";

type GeminiImageInput = {
  apiKey?: string;
  model: string;
  prompt: string;
  aspectRatio?: AspectRatio;
  referenceUrls?: string[];
};

type GeminiImageOutput = {
  bytes: Buffer;
  mimeType: string;
  model: string;
};

type InlineImagePart = {
  inlineData: {
    data: string;
    mimeType: string;
  };
};

function isSupportedMimeType(mimeType: string) {
  return ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(mimeType.toLowerCase());
}

async function buildInlineReferenceParts(urls: string[]) {
  const parts: InlineImagePart[] = [];

  for (const url of urls.slice(0, 6)) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn("[gemini-image-adapter] unable to fetch reference", { url, status: response.status });
        continue;
      }

      const mimeType = response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
      if (!isSupportedMimeType(mimeType)) {
        console.warn("[gemini-image-adapter] unsupported reference mime type", { url, mimeType });
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      parts.push({
        inlineData: {
          data: buffer.toString("base64"),
          mimeType,
        },
      });
    } catch (error) {
      console.warn("[gemini-image-adapter] failed to process reference", { url, error });
    }
  }

  return parts;
}

export async function runGeminiImageGeneration(input: GeminiImageInput): Promise<GeminiImageOutput> {
  const apiKey = input.apiKey ?? process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY or GEMINI_API_KEY environment variable.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const referenceParts = await buildInlineReferenceParts(input.referenceUrls ?? []);

  const promptWithAspect = input.aspectRatio ? `${input.prompt}\n\nPreferred aspect ratio: ${input.aspectRatio}.` : input.prompt;

  const contents = [
    {
      role: "user",
      parts: [{ text: promptWithAspect }, ...referenceParts],
    },
  ];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model: input.model,
        contents,
        config: {
          responseModalities: ["IMAGE"],
        },
      });

      const inlineImageData =
        response.candidates?.flatMap((candidate) => candidate.content?.parts ?? []).find((part) => part.inlineData)?.inlineData ?? null;

      if (!inlineImageData?.data) {
        throw new Error("Gemini image generation returned no image bytes.");
      }

      return {
        bytes: Buffer.from(inlineImageData.data, "base64"),
        mimeType: inlineImageData.mimeType ?? "image/png",
        model: input.model,
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

  throw new Error("Gemini image generation failed after retry.");
}
