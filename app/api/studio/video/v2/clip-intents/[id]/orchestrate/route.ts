import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { buildAnchorExpansionContext } from "@/lib/video/v2/anchorExpansion/plannerBridge";
import { normalizeExpansionSnapshot, normalizeReuseSnapshot, orchestrateClipIntent } from "@/lib/video/v2/orchestration/orchestrate";
import { buildTransitionPlan } from "@/lib/video/v2/intermediateStateEngine";
import { buildGarmentConstitution } from "@/lib/video/v2/governance/garmentConstitution";
import { assessTruthDebt } from "@/lib/video/v2/governance/truthDebt";

type WorkingPackRow = {
  id: string;
  status: string;
  readiness_score: number | null;
};

type ClipIntentRow = {
  id: string;
  compiled_anchor_pack_id: string | null;
  last_compiled_at: string | null;
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
      reuse_snapshot?: unknown;
      expansion_snapshot?: unknown;
    };

    const expansionContext = await buildAnchorExpansionContext(clipIntentId);
    const supabase = getSupabaseAdminClient();

    const { data: pack, error: packError } = await supabase
      .from("working_packs")
      .select("id,status,readiness_score")
      .eq("id", expansionContext.workingPackId)
      .maybeSingle<WorkingPackRow>();

    if (packError) return json(500, { success: false, error: packError.message });
    if (!pack) return json(404, { success: false, error: "Working pack not found." });

    const { data: intent, error: intentError } = await supabase
      .from("clip_intents")
      .select("id,compiled_anchor_pack_id,last_compiled_at")
      .eq("id", clipIntentId)
      .maybeSingle<ClipIntentRow>();

    if (intentError) return json(500, { success: false, error: intentError.message });
    if (!intent) return json(404, { success: false, error: "Clip intent not found." });

    const transitionPlan = buildTransitionPlan({
      clipIntentId,
      motionPrompt: expansionContext.motionPrompt,
      items: expansionContext.items.map((item) => ({
        id: item.id,
        role: item.role,
        generation_id: item.generation_id,
        source_kind: item.source_kind,
        confidence_score: item.confidence_score,
      })),
      garmentRisk: expansionContext.planner.riskSummary.garmentRisk,
      allowDirectFrontBack: true,
    });

    const garmentConstitution = buildGarmentConstitution({
      skuCode: `clip-intent-${clipIntentId}`,
      motionPrompt: expansionContext.motionPrompt,
      items: expansionContext.items.map((item) => ({
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
      motionComplexity: expansionContext.planner.riskSummary.motionComplexity,
      cameraComplexity: "simple",
      availableAnchors: expansionContext.items.map((item) => ({
        role: item.role,
        sourceKind: item.source_kind,
        isVerified: item.source_kind === "sku_verified_truth" || item.source_kind === "manual_verified_override",
      })),
      hasTransitionTruth: transitionPlan.strategy === "segmented",
      backRevealRequested: transitionPlan.target_direction !== "other",
      silhouetteRisk: expansionContext.planner.riskSummary.garmentRisk,
      printContinuityRisk: expansionContext.planner.riskSummary.viewDependency,
    });

    const plan = orchestrateClipIntent({
      planner: expansionContext.planner,
      workingPack: {
        id: pack.id,
        status: pack.status,
        readinessScore: Number(pack.readiness_score ?? 0),
        roles: expansionContext.items.map((item) => item.role),
      },
      compileSnapshot: {
        compiledAnchorPackId: intent.compiled_anchor_pack_id,
        compiledAt: intent.last_compiled_at,
      },
      reuseSnapshot: normalizeReuseSnapshot(body.reuse_snapshot),
      expansionSnapshot: normalizeExpansionSnapshot(body.expansion_snapshot),
      transitionPlan,
      governance: {
        garmentConstitution,
        truthDebt,
      },
    });

    return json(200, { success: true, data: plan });
  } catch (error) {
    return json(400, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
