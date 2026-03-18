import { type StudioAspectRatio } from "@/lib/studio/aspectRatios";
import { runVeoVideoGeneration } from "@/lib/ai/adapters/veoVideoAdapter";

export type RunVeoVideoInput = {
  apiKey?: string;
  model: string;
  prompt: string;
  referenceImageUrls: string[];
  aspectRatio?: StudioAspectRatio;
  durationSeconds: number;
};

export async function runVeoVideo(input: RunVeoVideoInput) {
  const referenceHeader = input.referenceImageUrls.length
    ? `Use the provided reference image(s) as grounding context: ${input.referenceImageUrls.join(", ")}.`
    : "No reference images were provided.";

  const composedPrompt = [
    referenceHeader,
    `Clip duration target: ${input.durationSeconds}s.`,
    input.prompt,
  ].join("\n\n");

  return runVeoVideoGeneration({
    apiKey: input.apiKey,
    model: input.model,
    prompt: composedPrompt,
    aspectRatio: input.aspectRatio,
  });
}
