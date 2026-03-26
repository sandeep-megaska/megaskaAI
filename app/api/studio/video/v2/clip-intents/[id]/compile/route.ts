import { NextRequest, NextResponse } from "next/server";
import { compileClipIntent, type CompilePlannerOverrides } from "@/lib/video/v2/compileClipIntent";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const clipIntentId = id?.trim();
    if (!clipIntentId) return json(400, { success: false, error: "clip intent id is required." });

    const body = (await request.json().catch(() => ({}))) as { planner_overrides?: CompilePlannerOverrides };
    const compiled = await compileClipIntent({ clipIntentId, plannerOverrides: body.planner_overrides });

    return json(200, {
      success: true,
      data: {
        clip_intent_id: compiled.clipIntentId,
        compiled_anchor_pack_id: compiled.compiledAnchorPackId,
        warnings: compiled.warnings,
        run_request_preview: compiled.runRequest,
      },
    });
  } catch (error) {
    return json(400, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
