import { GoogleGenAI } from "@google/genai";
import { mapGeminiProviderError } from "@/lib/ai/providerErrors";
import { buildGeminiImageParts } from "@/lib/ai/buildGeminiImageParts";
import { buildGarmentConditioningBundle } from "@/lib/tryon/buildGarmentConditioningBundle";
import { resolveSubjectConditioningImages } from "@/lib/tryon/resolveSubjectConditioningImages";
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
  debug: Record<string, unknown>;
  warnings: string[];
};

const DEFAULT_MODEL = "gemini-3-pro-image-preview";

function buildInstruction(input: AdapterInput) {
  const parts: string[] = [];

  if (input.adapterPayload?.compiledPrompt) {
    parts.push(input.adapterPayload.compiledPrompt);
  } else {
    parts.push(input.prompt);
  }

  parts.push(
    "Transformation mode: identity_transfer.",
    "This is NOT a creative redesign request.",
    "Transfer the exact garment identity from provided references onto the provided subject image.",
    "Only adapt for body fit and pose coherence; preserve garment construction and visual identity.",
    "Do not redesign, reinterpret, simplify, replace print, or change garment class.",
  );

  if (input.negativePrompt) {
    parts.push(`Avoid: ${input.negativePrompt}`);
  }

  if (input.aspectRatio) {
    parts.push(`Preferred aspect ratio: ${input.aspectRatio}.`);
  }

  return parts.join("\n\n");
}

export async function runGeminiImageConditionedTryOn(input: AdapterInput): Promise<AdapterOutput> {
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY or GEMINI_API_KEY environment variable.");
  }

  const selectedModel = input.model ?? DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey });

  const subjectResolution = resolveSubjectConditioningImages({
    subject: input.adapterPayload?.subject,
    selectedReferences: input.adapterPayload?.selectedReferences,
  });

  if (!subjectResolution.subjectImages.length) {
    throw new Error("Missing subject conditioning image for image-conditioned try-on.");
  }

  const garmentBundle = buildGarmentConditioningBundle({
    selectedReferences: input.adapterPayload?.selectedReferences,
    garmentAssets: input.adapterPayload?.garmentAssets,
  });

  if (!garmentBundle.orderedConditioningImages.length) {
    throw new Error("Missing garment conditioning images for image-conditioned try-on.");
  }

  const warningMessages: string[] = [];

  const subjectParts = await buildGeminiImageParts({
    references: subjectResolution.subjectImages,
    maxImages: 2,
  });
  if (!subjectParts.imageParts.length) {
    throw new Error("Failed to load subject conditioning image for image-conditioned try-on.");
  }

  const garmentParts = await buildGeminiImageParts({
    references: garmentBundle.orderedConditioningImages,
    maxImages: 8,
  });
  if (!garmentParts.imageParts.length) {
    throw new Error("Failed to load garment conditioning images for image-conditioned try-on.");
  }

  if (subjectParts.failedReferences.length || garmentParts.failedReferences.length) {
    warningMessages.push("Some conditioning references failed to load and were skipped.");
  }

  const contents = [{
    role: "user",
    parts: [
      { text: buildInstruction(input) },
      ...subjectParts.imageParts,
      ...garmentParts.imageParts,
    ],
  }];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await ai.models.generateContent({
        model: selectedModel,
        contents,
        config: {
          responseModalities: ["IMAGE"],
        },
      });

      const inlineImageData =
        response.candidates?.flatMap((candidate) => candidate.content?.parts ?? []).find((part) => part.inlineData)?.inlineData ?? null;

      if (!inlineImageData?.data) {
        throw new Error("Gemini image-conditioned try-on returned no image bytes.");
      }

      return {
        bytes: Buffer.from(inlineImageData.data, "base64"),
        mimeType: inlineImageData.mimeType ?? "image/png",
        model: selectedModel,
        warnings: warningMessages,
        debug: {
          conditioningDebug: {
            subjectImageCount: subjectParts.imageParts.length,
            garmentImageCount: garmentParts.imageParts.length,
            usedReferenceAssetIds: [...subjectParts.usedReferenceAssetIds, ...garmentParts.usedReferenceAssetIds],
            failedReferenceUrls: [...subjectParts.failedReferences, ...garmentParts.failedReferences].map((item) => item.url),
            failedReferenceDetails: [...subjectParts.failedReferences, ...garmentParts.failedReferences],
            transformationMode: "identity_transfer",
            adapterFamily: "gemini_image",
            subjectResolutionDebug: subjectResolution.debug,
          },
        },
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

  throw new Error("Gemini image-conditioned try-on failed after retry.");
}
