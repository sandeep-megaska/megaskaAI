type VeoTryOnVideoInput = {
  workflowMode?: string;
};

type VeoTryOnVideoOutput = {
  status: "queued" | "completed";
  workflowMode: "video-try-on";
  debug?: Record<string, unknown>;
};

export async function runVeoTryOnVideo(input: VeoTryOnVideoInput): Promise<VeoTryOnVideoOutput> {
  if (input.workflowMode !== "video-try-on") {
    throw new Error("Veo try-on video adapter is not yet implemented.");
  }

  throw new Error("Veo try-on video workflow is not yet implemented.");
}
