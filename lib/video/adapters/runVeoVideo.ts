import { type StudioAspectRatio } from "@/lib/studio/aspectRatios";
import { runVeoVideoGeneration } from "@/lib/ai/adapters/veoVideoAdapter";

export type RunVeoVideoInput = {
  apiKey?: string;
  model: string;
  prompt: string;
  firstFrameUrl?: string | null;
  lastFrameUrl?: string | null;
  referenceImageUrls?: string[];
  aspectRatio?: StudioAspectRatio;
  durationSeconds: number;
};

export async function runVeoVideo(input: RunVeoVideoInput) {
  return runVeoVideoGeneration({
    apiKey: input.apiKey,
    model: input.model,
    prompt: input.prompt,
    firstFrameUrl: input.firstFrameUrl ?? null,
    lastFrameUrl: input.lastFrameUrl ?? null,
    referenceImageUrls: input.referenceImageUrls ?? [],
    aspectRatio: input.aspectRatio,
    durationSeconds: input.durationSeconds,
  });
}
