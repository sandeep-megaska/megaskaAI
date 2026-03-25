import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("clip_intents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return json(500, { success: false, error: error.message });
    return json(200, { success: true, data: data ?? [] });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      source_profile_id?: string;
      intent_label?: string;
      motion_prompt?: string;
      aspect_ratio?: string;
      duration_seconds?: number;
    };

    if (!body.source_profile_id?.trim()) return json(400, { success: false, error: "source_profile_id is required." });
    if (!body.intent_label?.trim()) return json(400, { success: false, error: "intent_label is required." });
    if (!body.motion_prompt?.trim()) return json(400, { success: false, error: "motion_prompt is required." });

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("clip_intents")
      .insert({
        source_profile_id: body.source_profile_id.trim(),
        intent_label: body.intent_label.trim(),
        motion_prompt: body.motion_prompt.trim(),
        aspect_ratio: body.aspect_ratio?.trim() || "9:16",
        duration_seconds: Number(body.duration_seconds ?? 8),
        status: "ready",
      })
      .select("*")
      .single();

    if (error) return json(400, { success: false, error: error.message });
    return json(201, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
