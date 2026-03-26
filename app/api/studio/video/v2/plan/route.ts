import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { buildDirectorPlan } from "@/lib/video/v2/planner";
import { getPhase1TemplateById } from "@/lib/video/v2/templateMode";
import type { AnchorPack, AnchorPackItemRole, AnchorPackType, V2Mode } from "@/lib/video/v2/types";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      motion_request?: string;
      duration_seconds?: number;
      aspect_ratio?: string;
      exact_end_state_required?: boolean;
      prior_validated_clip_exists?: boolean;
      preferred_providers?: string[];
      selected_pack_id?: string;
      selected_pack_type?: AnchorPackType;
      aggregate_stability_score?: number;
      available_roles?: AnchorPackItemRole[];
      desired_mode?: V2Mode;
      production_mode?: "phase1_template" | "experimental_freeform";
      phase1_template_id?: string | null;
    };

    if (!body.motion_request?.trim()) return json(400, { success: false, error: "motion_request is required." });
    const template = body.production_mode === "phase1_template" ? getPhase1TemplateById(body.phase1_template_id) : null;
    if (body.production_mode === "phase1_template" && !template) {
      return json(400, { success: false, error: "A valid Phase-1 template is required in production mode." });
    }

    const supabase = getSupabaseAdminClient();
    const { data: packs, error: packsError } = await supabase
      .from("anchor_packs")
      .select("*,anchor_pack_items(*)")
      .in("status", ["draft", "ready"])
      .order("aggregate_stability_score", { ascending: false })
      .limit(20);

    if (packsError) return json(500, { success: false, error: packsError.message });

    const plan = buildDirectorPlan({
      motionRequest: body.motion_request,
      durationSeconds: body.duration_seconds ?? 8,
      aspectRatio: body.aspect_ratio ?? "9:16",
      exactEndStateRequired: Boolean(body.exact_end_state_required),
      priorValidatedClipExists: Boolean(body.prior_validated_clip_exists),
      preferredProviders: body.preferred_providers,
      desiredMode: body.desired_mode,
      productionMode: body.production_mode ?? "experimental_freeform",
      phase1TemplateId: body.phase1_template_id ?? null,
      selectedPackId: body.selected_pack_id,
      selectedPackType: body.selected_pack_type,
      aggregateStabilityScore: body.aggregate_stability_score,
      availableRoles: body.available_roles,
      packs: (packs ?? []) as AnchorPack[],
    });
    if (template?.requires_exact_end_state && plan.mode_selected !== "frames_to_video") {
      return json(400, { success: false, error: `Template '${template.label}' must run in frames_to_video mode.` });
    }
    if (template && plan.missing_requirements.some((reason) => reason.startsWith("Missing template role:"))) {
      return json(400, { success: false, error: `Template '${template.label}' is not ready. ${plan.missing_requirements.join(" ")}` });
    }

    const { data, error } = await supabase
      .from("video_generation_plans")
      .insert({
        motion_request: body.motion_request,
        mode_selected: plan.mode_selected,
        why_mode_selected: plan.why_mode_selected,
        recommended_pack_ids: plan.recommended_pack_ids,
        required_reference_roles: plan.required_reference_roles,
        duration_seconds: plan.duration_seconds,
        aspect_ratio: plan.aspect_ratio,
        motion_complexity: plan.motion_complexity,
        anchor_risk_level: plan.anchor_risk_level,
        director_prompt: plan.director_prompt,
        fallback_prompt: plan.fallback_prompt,
        negative_constraints: plan.negative_constraints,
        provider_order: plan.provider_order,
        planner_model: "gemini-3.1-pro-preview",
        planner_version: "gemini-3.1-pro-preview",
      })
      .select("*")
      .single();

    if (error) return json(400, { success: false, error: error.message });
    return json(201, { success: true, data, plan });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
