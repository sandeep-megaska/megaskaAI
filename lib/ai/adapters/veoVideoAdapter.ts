import { GoogleGenAI } from "@google/genai";
import { mapGeminiProviderError } from "@/lib/ai/providerErrors";
import { type StudioAspectRatio } from "@/lib/studio/aspectRatios";

const SUPPORTED_VEO_ASPECT_RATIOS = ["16:9", "9:16"] as const;
type VeoAspectRatio = (typeof SUPPORTED_VEO_ASPECT_RATIOS)[number];

type VeoInput = {
  apiKey?: string;
  model: string;
  prompt: string;
  aspectRatio?: StudioAspectRatio;
};

type VeoOutput = {
  bytes: Buffer;
  mimeType: string;
  model: string;
};

async function resolveVideoBytes(video: { videoBytes?: string; uri?: string }) {
  if (video.videoBytes) {
    return Buffer.from(video.videoBytes, "base64");
  }

  if (!video.uri) {
    return null;
  }

  const response = await fetch(video.uri);
  if (!response.ok) {
    throw new Error(`Unable to download generated video from URI (${response.status})`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function runVeoVideoGeneration(input: VeoInput): Promise<VeoOutput> {
  const apiKey = input.apiKey ?? process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_API_KEY or GEMINI_API_KEY environment variable.");
  }

  const aspectRatio = (input.aspectRatio ?? "16:9") as StudioAspectRatio;
  if (!SUPPORTED_VEO_ASPECT_RATIOS.includes(aspectRatio as VeoAspectRatio)) {
    throw new Error("Video Project currently supports only 16:9 and 9:16 aspect ratios.");
  }

  const ai = new GoogleGenAI({ apiKey });

  let operation;
  try {
    operation = await ai.models.generateVideos({
      model: input.model,
      source: { prompt: input.prompt },
      config: {
        numberOfVideos: 1,
        aspectRatio,
      },
    });
  } catch (error) {
    mapGeminiProviderError(error);
  }

  if (!operation) {
    throw new Error("Video generation failed before an operation was returned.");
  }

  let pollCount = 0;
  while (!operation.done && pollCount < 60) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    operation = await ai.operations.getVideosOperation({ operation });
    pollCount += 1;
  }

  if (!operation.done) {
    throw new Error("Video generation timed out before completion.");
  }

  const generatedVideo = operation.response?.generatedVideos?.[0]?.video;
  if (!generatedVideo) {
    throw new Error("Video generation returned no video output.");
  }

  const bytes = await resolveVideoBytes(generatedVideo);
  if (!bytes) {
    throw new Error("Unable to resolve generated video bytes.");
  }

  return {
    bytes,
    mimeType: generatedVideo.mimeType ?? "video/mp4",
    model: input.model,
  };
}
