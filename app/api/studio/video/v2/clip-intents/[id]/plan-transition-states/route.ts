import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { planCreativeFidelity } from "@/lib/video/v2/creativeFidelity/planner";
import { buildTransitionPlan, compileTransitionSegments } from "@/lib/video/v2/intermediateStateEngine";

type ClipIntentRow = {
  id: string;
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
    });

    return json(200, {
      success: true,
      data: {
        ...transitionPlan,
        compiled_segments: compileTransitionSegments(transitionPlan),
      },
    });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
