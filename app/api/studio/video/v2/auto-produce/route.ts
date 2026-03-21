import { NextResponse } from "next/server";
import { buildAutoProductionPreview, createAutoProductionJob, runAutoProductionJob } from "@/lib/video/v2/autoProduction";
import type { AutoProductionControlMode } from "@/lib/video/v2/types";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      prompt?: string;
      model_id?: string;
      garment_id?: string;
      scene?: string;
      aspect_ratio?: string;
      control_mode?: AutoProductionControlMode;
      preview_only?: boolean;
    };

    if (!body.prompt?.trim()) return json(400, { success: false, error: "prompt is required." });
    const controlMode = body.control_mode ?? "balanced";
    if (!["safe", "balanced", "creative"].includes(controlMode)) {
      return json(400, { success: false, error: "control_mode must be safe | balanced | creative." });
    }

    const input = {
      prompt: body.prompt.trim(),
      model_id: body.model_id,
      garment_id: body.garment_id,
      scene: body.scene,
      aspect_ratio: body.aspect_ratio ?? "9:16",
      control_mode: controlMode,
    };

    const preview = await buildAutoProductionPreview(input);
    if (body.preview_only) {
      return json(200, { success: true, data: { preview } });
    }

    const job = await createAutoProductionJob(input);
    void runAutoProductionJob(job);

    return json(202, {
      success: true,
      data: {
        job_id: job.id,
        status: job.status,
        preview,
      },
    });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
