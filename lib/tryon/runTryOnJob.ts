import { findBackendById, getDefaultBackendForType } from "@/lib/ai-backends";
import { runGoogleImageTryOn } from "@/lib/tryon/adapters/googleImageAdapter";

export type RunTryOnInput = {
  backendId?: string | null;
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: "1:1" | "16:9" | "9:16";
};

export type RunTryOnResult = {
  bytes: Buffer;
  mimeType: string;
  backendId: string;
  backendModel: string;
};

export async function runTryOnJob(input: RunTryOnInput): Promise<RunTryOnResult> {
  const backend = findBackendById(input.backendId) ?? getDefaultBackendForType("image");

  if (backend.type !== "image") {
    throw new Error("Try-on currently supports image backends only.");
  }

  const output = await runGoogleImageTryOn({
    model: backend.model,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    aspectRatio: input.aspectRatio,
  });

  return {
    bytes: output.bytes,
    mimeType: output.mimeType,
    backendId: backend.id,
    backendModel: output.model,
  };
}
