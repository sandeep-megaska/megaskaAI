import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { computeFidelityPlan } from "@/lib/video/v2/fidelityPlanner";

type ClipIntentRow = {
  id: string;
  motion_prompt: string;
};

type WorkingPackRow = {
  id: string;
};

type WorkingPackItemRow = {
  role: string;
  generation_id: string | null;
  source_kind: string;
};

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const clipIntentId = id?.trim();
    if (!clipIntentId) return json(400, { success: false, error: "clip intent id is required." });

    const supabase = getSupabaseAdminClient();
    const { data: intent, error: intentError } = await supabase
      .from("clip_intents")
      .select("id,motion_prompt")
      .eq("id", clipIntentId)
      .maybeSingle<ClipIntentRow>();

    if (intentError) return json(500, { success: false, error: intentError.message });
    if (!intent) return json(404, { success: false, error: "Clip intent not found." });

    const { data: packs, error: packsError } = await supabase
      .from("working_packs")
      .select("id")
      .eq("clip_intent_id", intent.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (packsError) return json(500, { success: false, error: packsError.message });

    const pack = (packs?.[0] ?? null) as WorkingPackRow | null;
    if (!pack) return json(400, { success: false, error: "No working pack found for this clip intent." });

    const { data: rawItems, error: itemsError } = await supabase
      .from("working_pack_items")
      .select("role,generation_id,source_kind")
      .eq("working_pack_id", pack.id);

    if (itemsError) return json(500, { success: false, error: itemsError.message });
    const items = (rawItems ?? []) as WorkingPackItemRow[];

    const plan = computeFidelityPlan({
      clipIntentId: intent.id,
      motionPrompt: intent.motion_prompt,
      workingPackId: pack.id,
      items,
    });

    const { error: insertError } = await supabase.from("clip_fidelity_plans").insert({
      clip_intent_id: intent.id,
      fidelity_tier: plan.fidelity_tier,
      motion_complexity: plan.motion_complexity,
      view_dependency: plan.view_dependency,
      garment_risk: plan.garment_risk,
      scene_risk: plan.scene_risk,
      required_roles: plan.required_roles,
      missing_roles: plan.missing_roles,
      allowed_synthesis_roles: plan.allowed_synthesis_roles,
      decision: plan.decision,
      decision_reason: plan.reason,
      recommended_mode: plan.recommended_mode,
    });

    if (insertError) return json(500, { success: false, error: insertError.message });

    return json(200, {
      success: true,
      data: {
        fidelity_tier: plan.fidelity_tier,
        decision: plan.decision,
        missing_roles: plan.missing_roles,
        allowed_synthesis_roles: plan.allowed_synthesis_roles,
        recommended_mode: plan.recommended_mode,
        reason: plan.reason,
      },
    });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
