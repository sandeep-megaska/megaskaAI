import { GoogleGenAI } from "@google/genai";
import { mapGeminiProviderError } from "@/lib/ai/providerErrors";
import { buildGeminiImageParts } from "@/lib/ai/buildGeminiImageParts";
import type { TryOnExecutionPayload } from "@/lib/tryon/types";

type GeminiTryOnOutput = {
  bytes: Buffer;
  mimeType: string;
  model: string;
  imageBase64: string;
  imageUrl: string | null;
  provider: {
    name: "google";
    adapterFamily: "gemini-image";
  };
  rawResponseExcerpt: {
    candidateCount: number;
    finishReason: string | null;
  };
  warnings: string[];
  debug: Record<string, unknown>;
};

function buildTransformationInstruction(payload: TryOnExecutionPayload) {
  const promptParts: string[] = [
    payload.compiledPrompt || payload.prompt,
    "Mode: image-conditioned try-on fidelity transfer.",
    "No reconstruction: transfer garment identity exactly from references.",
    "Preserve garment structure, print placement, colorway, and silhouette.",
    "Only adapt pose, fit drape, and perspective for subject coherence.",
    "Do not redesign, stylize, invent patterns, or alter garment class.",
  ];

  if (payload.negativePrompt) {
    promptParts.push(`Avoid: ${payload.negativePrompt}`);
  }

  if (payload.aspectRatio) {
    promptParts.push(`Preferred output aspect ratio: ${payload.aspectRatio}.`);
  }

  return promptParts.join("\n\n");
}

export async function runGeminiImageTryOn(payload: TryOnExecutionPayload): Promise<GeminiTryOnOutput> {
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY or GEMINI_API_KEY environment variable.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const subjectReferences = payload.references.filter((reference) => reference.kind === "subject");
  const garmentReferences = payload.references.filter((reference) => reference.kind !== "subject");

  if (!subjectReferences.length) {
    throw new Error("Missing subject conditioning image for image-conditioned try-on.");
  }

  if (!garmentReferences.length) {
    throw new Error("Missing garment conditioning images for image-conditioned try-on.");
  }

  const warnings: string[] = [];

  const subjectParts = await buildGeminiImageParts({
    references: subjectReferences.map((reference) => ({
      url: reference.url,
      role: reference.kind,
      assetId: reference.assetId,
    })),
    maxImages: 2,
  });

  if (!subjectParts.imageParts.length) {
    throw new Error("Failed to load subject conditioning image for image-conditioned try-on.");
  }

  const garmentParts = await buildGeminiImageParts({
    references: garmentReferences.map((reference) => ({
      url: reference.url,
      role: reference.kind,
      assetId: reference.assetId,
    })),
    maxImages: 8,
  });

  if (!garmentParts.imageParts.length) {
    throw new Error("Failed to load garment conditioning images for image-conditioned try-on.");
  }

  if (subjectParts.failedReferences.length || garmentParts.failedReferences.length) {
    warnings.push("Some conditioning references failed to load and were skipped.");
  }

  const contents = [{
    role: "user",
    parts: [{ text: buildTransformationInstruction(payload) }, ...subjectParts.imageParts, ...garmentParts.imageParts],
  }];

  try {
    const response = await ai.models.generateContent({
      model: payload.backendModel,
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
      model: payload.backendModel,
      imageBase64: inlineImageData.data,
      imageUrl: null,
      provider: {
        name: "google",
        adapterFamily: "gemini-image",
      },
      rawResponseExcerpt: {
        candidateCount: response.candidates?.length ?? 0,
        finishReason: response.candidates?.[0]?.finishReason ?? null,
      },
      warnings,
      debug: {
        usedReferenceAssetIds: [...subjectParts.usedReferenceAssetIds, ...garmentParts.usedReferenceAssetIds],
        failedReferenceUrls: [...subjectParts.failedReferences, ...garmentParts.failedReferences].map((item) => item.url),
        subjectImageCount: subjectParts.imageParts.length,
        garmentImageCount: garmentParts.imageParts.length,
      },
    };
  } catch (error) {
    mapGeminiProviderError(error);
  }
}
