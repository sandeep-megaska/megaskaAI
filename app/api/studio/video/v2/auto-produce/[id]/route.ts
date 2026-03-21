import { NextResponse } from "next/server";
import { getAutoProductionJob } from "@/lib/video/v2/autoProduction";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const job = await getAutoProductionJob(id);
    if (!job) return json(404, { success: false, error: "Auto production job not found." });

    return json(200, {
      success: true,
      data: {
        status: job.status,
        progress: job.progress_json,
        sequence_id: job.sequence_id,
        output_url: job.progress_json.output_url ?? null,
      },
    });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
