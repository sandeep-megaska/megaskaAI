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
  const primaryReference = input.referenceImageUrls[0] ?? null;
  const secondaryReferences = input.referenceImageUrls.slice(1);

  const referenceHeader = primaryReference
    ? [
        "PRIMARY MASTER IMAGE (source of truth for all frames):",
        primaryReference,
        secondaryReferences.length
          ? `Additional references (low priority, do not override master): ${secondaryReferences.join(", ")}.`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "No reference images were provided.";

  const composedPrompt = [referenceHeader, `Clip duration target: ${input.durationSeconds}s.`, input.prompt]
    .filter(Boolean)
    .join("\n\n");

  return runVeoVideoGeneration({
    apiKey: input.apiKey,
    model: input.model,
    prompt: composedPrompt,
    aspectRatio: input.aspectRatio,
  });
}
