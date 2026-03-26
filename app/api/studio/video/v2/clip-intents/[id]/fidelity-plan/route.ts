import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { persistCreativeFidelityPlan } from "@/lib/video/v2/creativeFidelity/persistence";
import { planCreativeFidelity } from "@/lib/video/v2/creativeFidelity/planner";
import { buildTransitionPlan, compileTransitionSegments } from "@/lib/video/v2/intermediateStateEngine";

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

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const clipIntentId = id?.trim();
    if (!clipIntentId) return json(400, { success: false, error: "clip intent id is required." });

    const body = (await request.json().catch(() => ({}))) as {
      requested_start?: "front" | "three_quarter_left" | "three_quarter_right" | "mid_turn_left" | "mid_turn_right" | "back" | "detail" | "fit_anchor" | "start_frame" | "end_frame";
      requested_end?: "front" | "three_quarter_left" | "three_quarter_right" | "mid_turn_left" | "mid_turn_right" | "back" | "detail" | "fit_anchor" | "start_frame" | "end_frame";
      motion_complexity?: "low" | "medium" | "high";
      duration_seconds?: 4 | 6 | 8;
      validation_mode?: boolean;
      start_end_frame_mode?: boolean;
    };

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

    const plan = planCreativeFidelity({
      clipIntentId: intent.id,
      workingPackId: pack.id,
      motionPrompt: intent.motion_prompt,
      items,
    });

    await persistCreativeFidelityPlan(supabase, plan);

    const transitionPlan = buildTransitionPlan({
      clipIntentId: intent.id,
      motionPrompt: intent.motion_prompt,
      items: items.map((item, index) => ({
        id: `${pack.id}:${index}:${item.role}`,
        role: item.role,
        generation_id: item.generation_id,
        source_kind: item.source_kind,
      })),
      garmentRisk: plan.riskSummary.garmentRisk,
      allowDirectFrontBack: true,
      requestedStart: body.requested_start,
      requestedEnd: body.requested_end,
      requestedDurationSeconds: body.duration_seconds,
      validationMode: body.validation_mode,
      startEndFrameMode: body.start_end_frame_mode,
      motionComplexity: body.motion_complexity,
    });

    return json(200, {
      success: true,
      data: {
        decision: plan.decision,
        recommended_mode: plan.recommendedMode,
        reasons: plan.reasons,
        warnings: plan.warnings,
        recommendations: plan.recommendations,
        risk_summary: plan.riskSummary,
        required_roles: plan.requiredRoles,
        missing_roles: plan.missingRoles,
        critical_missing_roles: plan.criticalMissingRoles,
        allowed_synthesis_roles: plan.allowedSynthesisRoles,
        transition_plan: transitionPlan,
        compiled_transition_segments: compileTransitionSegments(transitionPlan),
      },
    });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
