import { runStudioGeneration } from "@/lib/generation/runStudioGeneration";
import type { AnchorExpansionContext, ExpansionGenerationOutput } from "@/lib/video/v2/anchorExpansion/types";

export async function generateExpandedAnchor(input: {
  context: AnchorExpansionContext;
  role: string;
  prompt: string;
}): Promise<ExpansionGenerationOutput> {
  const result = await runStudioGeneration({
    type: "image",
    prompt: input.prompt,
    aspectRatio: "9:16",
    referenceUrls: input.context.referenceUrls,
  });

  return {
    bytes: result.bytes,
    mimeType: result.mimeType,
    backendId: result.backend.id,
    backendModel: result.backendModel,
  };
}
