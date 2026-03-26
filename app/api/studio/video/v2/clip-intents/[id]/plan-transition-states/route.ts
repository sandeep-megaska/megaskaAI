import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { planCreativeFidelity } from "@/lib/video/v2/creativeFidelity/planner";
import { buildTransitionPlan, compileTransitionSegments } from "@/lib/video/v2/intermediateStateEngine";
import { buildGarmentConstitution } from "@/lib/video/v2/governance/garmentConstitution";
import { assessTruthDebt } from "@/lib/video/v2/governance/truthDebt";

type ClipIntentRow = {
  id: string;
  sku_code: string | null;
  motion_prompt: string;
};

type WorkingPackRow = { id: string };

type WorkingPackItemRow = {
  id: string;
  role: string;
  generation_id: string | null;
  source_kind: string;
  confidence_score: number | null;
  sort_order: number | null;
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
      .select("id,sku_code,motion_prompt")
      .eq("id", clipIntentId)
      .maybeSingle<ClipIntentRow>();

    if (intentError) return json(500, { success: false, error: intentError.message });
    if (!intent) return json(404, { success: false, error: "Clip intent not found." });

    const { data: packs, error: packError } = await supabase
      .from("working_packs")
      .select("id")
      .eq("clip_intent_id", clipIntentId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (packError) return json(500, { success: false, error: packError.message });
    const pack = (packs?.[0] ?? null) as WorkingPackRow | null;
    if (!pack) return json(400, { success: false, error: "No working pack found for this clip intent." });

    const { data: rawItems, error: itemsError } = await supabase
      .from("working_pack_items")
      .select("id,role,generation_id,source_kind,confidence_score,sort_order")
      .eq("working_pack_id", pack.id)
      .returns<WorkingPackItemRow[]>();

    if (itemsError) return json(500, { success: false, error: itemsError.message });
    const items = rawItems ?? [];

    const fidelityPlan = planCreativeFidelity({
      clipIntentId,
      workingPackId: pack.id,
      motionPrompt: intent.motion_prompt,
      items,
    });

    const transitionPlan = buildTransitionPlan({
      clipIntentId,
      motionPrompt: intent.motion_prompt,
      items,
      garmentRisk: fidelityPlan.riskSummary.garmentRisk,
      allowDirectFrontBack: true,
      requestedStart: body.requested_start,
      requestedEnd: body.requested_end,
      requestedDurationSeconds: body.duration_seconds,
      validationMode: body.validation_mode,
      startEndFrameMode: body.start_end_frame_mode,
      motionComplexity: body.motion_complexity,
    });

    const garmentConstitution = buildGarmentConstitution({
      skuCode: intent.sku_code?.trim() || `clip-intent-${clipIntentId}`,
      motionPrompt: intent.motion_prompt,
      items: items.map((item) => ({
        role: item.role,
        generation_id: item.generation_id,
        source_kind: item.source_kind,
        confidence_score: item.confidence_score,
      })),
    });

    const truthDebt = assessTruthDebt({
      startState: transitionPlan.planned_sequence[0] ?? "front",
      endState: transitionPlan.planned_sequence[transitionPlan.planned_sequence.length - 1] ?? null,
      garmentRiskTier: garmentConstitution.riskTier,
      silhouetteClass: garmentConstitution.silhouetteClass,
      coverageClass: garmentConstitution.coverageClass,
      motionComplexity: fidelityPlan.riskSummary.motionComplexity,
      cameraComplexity: fidelityPlan.recommendedMode === "frames_to_video" ? "simple" : "cinematic",
      availableAnchors: items.map((item) => ({
        role: item.role,
        sourceKind: item.source_kind,
        isVerified: item.source_kind === "sku_verified_truth" || item.source_kind === "manual_verified_override",
      })),
      hasTransitionTruth: transitionPlan.strategy === "segmented",
      backRevealRequested: transitionPlan.target_direction !== "other",
      silhouetteRisk: fidelityPlan.riskSummary.garmentRisk,
      printContinuityRisk: fidelityPlan.riskSummary.viewDependency,
    });

    return json(200, {
      success: true,
      data: {
        ...transitionPlan,
        garment_constitution: garmentConstitution,
        truth_debt: truthDebt,
        compiled_segments: compileTransitionSegments(transitionPlan),
      },
    });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
