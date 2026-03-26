import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { buildTemplatePromptScaffold, getPhase1TemplateById } from "@/lib/video/v2/templateMode";

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
      clip_goal?: string;
      scene_policy?: string;
      motion_template?: string;
      fidelity_priority?: string;
      sku_code?: string;
      production_mode?: "phase1_template" | "experimental_freeform";
      phase1_template_id?: string | null;
    };

    if (!body.source_profile_id?.trim()) return json(400, { success: false, error: "source_profile_id is required." });
    if (!body.intent_label?.trim()) return json(400, { success: false, error: "intent_label is required." });
    const template = body.production_mode === "phase1_template" ? getPhase1TemplateById(body.phase1_template_id) : null;
    if (body.production_mode === "phase1_template" && !template) {
      return json(400, { success: false, error: "A valid Phase-1 template is required in production mode." });
    }
    if (!template && !body.motion_prompt?.trim()) return json(400, { success: false, error: "motion_prompt is required." });
    const motionPrompt = template
      ? buildTemplatePromptScaffold(template, body.motion_prompt)
      : body.motion_prompt?.trim() || "";

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("clip_intents")
      .insert({
        source_profile_id: body.source_profile_id.trim(),
        intent_label: body.intent_label.trim(),
        motion_prompt: motionPrompt,
        aspect_ratio: body.aspect_ratio?.trim() || "9:16",
        duration_seconds: Number(body.duration_seconds ?? template?.duration_default ?? 8),
        clip_goal: body.clip_goal?.trim() || template?.description || null,
        scene_policy: body.scene_policy?.trim() || null,
        motion_template: template?.template_id ?? (body.motion_template?.trim() || null),
        fidelity_priority: body.fidelity_priority?.trim() || "maximum-fidelity",
        sku_code: body.sku_code?.trim()?.toUpperCase() || null,
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
