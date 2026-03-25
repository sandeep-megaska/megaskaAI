import { NextResponse } from "next/server";
import { autoBuildWorkingPack } from "@/lib/video/v2/autoPackBuilder";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { clip_intent_id?: string };
    if (!body.clip_intent_id?.trim()) return json(400, { success: false, error: "clip_intent_id is required." });

    const data = await autoBuildWorkingPack({ clipIntentId: body.clip_intent_id.trim() });
    return json(201, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
