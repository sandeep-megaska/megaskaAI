import { NextRequest, NextResponse } from "next/server";
import { generateClipIntent } from "@/lib/video/v2/generateClipIntent";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const clipIntentId = id?.trim();
    if (!clipIntentId) return json(400, { success: false, error: "clip intent id is required." });

    const result = await generateClipIntent({ clipIntentId });

    return json(201, {
      success: true,
      data: result,
    });
  } catch (error) {
    return json(400, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
