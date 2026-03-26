import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { buildPackReadinessReport } from "@/lib/video/v2/anchorPacks";
import { buildClipIntentPrompt } from "@/lib/video/v2/buildClipIntentPrompt";
import { persistCreativeFidelityPlan } from "@/lib/video/v2/creativeFidelity/persistence";
import { planCreativeFidelity } from "@/lib/video/v2/creativeFidelity/planner";
import { buildCompileTraceabilitySnapshot } from "@/lib/video/v2/compileTraceability";
import {
  buildRuntimeFidelityMetadata,
  detectExactEndStateRequired,
  getVerifiedAnchorIds,
  hardenPromptForExactState,
  resolveRuntimeMode,
  selectRuntimeFrames,
  validateRuntimeFidelity,
} from "@/lib/video/v2/fidelityRuntime";
import { getPhase1TemplateById } from "@/lib/video/v2/templateMode";
import { ANCHOR_ITEM_ROLES, type ExecuteVideoRunRequest, type MotionComplexity, type AnchorRiskLevel, type AnchorPackItemRole, type V2Mode } from "@/lib/video/v2/types";

type ClipIntentRow = {
  id: string;
  source_profile_id: string;
  motion_prompt: string;
  aspect_ratio: string;
  duration_seconds: number;
  clip_goal?: string | null;
  scene_policy?: string | null;
  motion_template?: string | null;
  fidelity_priority?: string | null;
  compiled_anchor_pack_id?: string | null;
};

type WorkingPackRow = {
  id: string;
  source_profile_id: string;
  clip_intent_id: string;
  status: string;
  readiness_score: number;
  warning_messages: string[] | null;
  pack_meta?: Record<string, unknown> | null;
};

type WorkingPackItemRow = {
  id: string;
  working_pack_id: string;
  role: string;
  generation_id: string | null;
  source_kind: string;
  confidence_score: number;
  sort_order: number;
};

type CompileResult = {
  clipIntentId: string;
  workingPackId: string;
  sourceProfileId: string;
  compiledAnchorPackId: string;
  warnings: string[];
  runRequest: ExecuteVideoRunRequest;
};

const DEFAULT_REQUIRED_ROLES = ["fit_anchor", "front"] as const;
const VERIFIED_SOURCE_KINDS = new Set(["sku_verified_truth", "manual_verified_override"]);

function asObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function classifyMotionComplexity(motionRequest: string): MotionComplexity {
  const normalized = motionRequest.toLowerCase();
  if (/run|jump|spin|dance|crowd|vehicle|explosion/.test(normalized)) return "high";
  if (/turn|walk|step|pivot|reach|pose/.test(normalized)) return "medium";
  return "low";
}

function deriveAnchorRiskLevel(stability: number, motionComplexity: MotionComplexity): AnchorRiskLevel {
  if (motionComplexity === "high" && stability < 0.75) return "high";
  if (motionComplexity === "medium" && stability < 0.65) return "medium";
  if (stability < 0.45) return "high";
  if (stability < 0.7) return "medium";
  return "low";
}

function toAnchorRole(role: string) {
  return (ANCHOR_ITEM_ROLES as readonly string[]).includes(role) ? role : null;
}

function isPackReadyOrApproved(pack: WorkingPackRow) {
  const meta = asObject(pack.pack_meta);
  const reviewStatus = String(meta.review_status ?? "").toLowerCase();
  const approved = Boolean(meta.approved);
  return pack.status === "ready" || reviewStatus === "approved" || approved;
}

function resolveCompileMode(baseMode: V2Mode, recommendedMode: V2Mode, warnings: string[]) {
  if (recommendedMode === "ingredients_to_video" && baseMode === "frames_to_video") {
    warnings.push("Planner guardrail downgraded mode to ingredients_to_video to preserve anchor truth.");
    return "ingredients_to_video" as V2Mode;
  }
  return recommendedMode === "frames_to_video" ? "frames_to_video" : baseMode;
}


export async function compileClipIntent(input: { clipIntentId: string; force?: boolean }): Promise<CompileResult> {
  const supabase = getSupabaseAdminClient();

  const { data: intent, error: intentError } = await supabase
    .from("clip_intents")
    .select("id,source_profile_id,motion_prompt,aspect_ratio,duration_seconds,clip_goal,scene_policy,motion_template,fidelity_priority,compiled_anchor_pack_id")
    .eq("id", input.clipIntentId)
    .maybeSingle<ClipIntentRow>();

  if (intentError) throw new Error(intentError.message);
  if (!intent) throw new Error("Clip intent not found.");
  const selectedTemplate = getPhase1TemplateById(intent.motion_template);
  const requiredRoles: AnchorPackItemRole[] = selectedTemplate?.required_roles ?? [...DEFAULT_REQUIRED_ROLES];

  const { data: packs, error: packsError } = await supabase
    .from("working_packs")
    .select("id,source_profile_id,clip_intent_id,status,readiness_score,warning_messages,pack_meta")
    .eq("clip_intent_id", intent.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (packsError) throw new Error(packsError.message);
  const pack = (packs?.[0] ?? null) as WorkingPackRow | null;
  if (!pack) throw new Error("No working pack found for this clip intent. Auto-build a working pack first.");

  const { data: rawItems, error: itemsError } = await supabase
    .from("working_pack_items")
    .select("id,working_pack_id,role,generation_id,source_kind,confidence_score,sort_order")
    .eq("working_pack_id", pack.id)
    .order("sort_order", { ascending: true });

  if (itemsError) throw new Error(itemsError.message);
  const items = (rawItems ?? []) as WorkingPackItemRow[];

  const fidelityPlan = planCreativeFidelity({
    clipIntentId: intent.id,
    workingPackId: pack.id,
    motionPrompt: intent.motion_prompt,
    items: items.map((item) => ({
      role: item.role,
      generation_id: item.generation_id,
      source_kind: item.source_kind,
    })),
  });

  await persistCreativeFidelityPlan(supabase, fidelityPlan);

  if (fidelityPlan.decision === "block") {
    throw new Error(fidelityPlan.reasons[0] ?? "Creative fidelity planner blocked compile.");
  }

  const warnings = [...(pack.warning_messages ?? []), ...fidelityPlan.warnings];
  if (!isPackReadyOrApproved(pack)) {
    throw new Error("Working pack must be ready/approved before compile.");
  }
  if (Number(pack.readiness_score ?? 0) < 0.55) {
    throw new Error("Working pack readiness score must be at least 0.55 before compile.");
  }

  const roleSet = new Set(items.map((item) => item.role));
  for (const role of requiredRoles) {
    if (!roleSet.has(role)) throw new Error(`Working pack is missing required role '${role}'.`);
  }

  const missingGenerationRoles = requiredRoles.filter((role) => !items.find((item) => item.role === role && item.generation_id));
  if (missingGenerationRoles.length) {
    throw new Error(`Required role generation is missing for: ${missingGenerationRoles.join(", ")}.`);
  }
  if (selectedTemplate?.verification_requirements.length) {
    const unmetVerification = selectedTemplate.verification_requirements.filter((requirement) => {
      const matching = items.filter((item) => item.role === requirement.role && item.generation_id);
      return !matching.some((item) => VERIFIED_SOURCE_KINDS.has(String(item.source_kind ?? "").toLowerCase()));
    });
    if (unmetVerification.length) {
      throw new Error(`Template '${selectedTemplate.label}' requires verified truth for: ${unmetVerification.map((item) => item.label).join(", ")}.`);
    }
  }

  const compileItems = items.filter((item) => Boolean(item.generation_id));
  if (compileItems.length < items.length) {
    warnings.push("Some working pack items were skipped during compile because generation_id is missing.");
  }

  const readinessItems = compileItems
    .map((item) => ({ role: toAnchorRole(item.role), stability_score: Number(item.confidence_score ?? 0) }))
    .filter((item): item is { role: (typeof ANCHOR_ITEM_ROLES)[number]; stability_score: number } => Boolean(item.role));

  const readiness = buildPackReadinessReport({
    packType: "hybrid",
    items: readinessItems,
    aggregateStabilityScore: Number(pack.readiness_score ?? 0),
    priorValidatedClipExists: false,
  });

  const plannerMode = resolveCompileMode(readiness.recommendedMode as V2Mode, fidelityPlan.recommendedMode, warnings);
  const modeSelected = selectedTemplate?.mode_preference ?? plannerMode;
  if (selectedTemplate?.requires_exact_end_state && modeSelected !== "frames_to_video") {
    throw new Error(`Template '${selectedTemplate.label}' requires frames_to_video mode.`);
  }
  const exactEndStateRequired = selectedTemplate?.requires_exact_end_state ?? detectExactEndStateRequired(intent.motion_prompt);
  const frameSelection = selectRuntimeFrames({
    motionPrompt: intent.motion_prompt,
    items,
    exactEndStateRequired,
  });
  const runtimeModeSelected = resolveRuntimeMode({
    requestedMode: modeSelected,
    exactEndStateRequired,
    startFrameGenerationId: frameSelection.startFrameGenerationId,
    endFrameGenerationId: frameSelection.endFrameGenerationId,
  });
  validateRuntimeFidelity({
    exactEndStateRequired,
    modeSelected: runtimeModeSelected,
    startFrameGenerationId: frameSelection.startFrameGenerationId,
    endFrameGenerationId: frameSelection.endFrameGenerationId,
  });

  const promptBase = buildClipIntentPrompt({
    clip_goal: intent.clip_goal,
    scene_policy: intent.scene_policy,
    motion_template: intent.motion_template,
    fidelity_priority: intent.fidelity_priority,
    motion_prompt: intent.motion_prompt,
    template: selectedTemplate,
  });
  const hardenedDirectorPrompt = hardenPromptForExactState({
    directorPrompt: promptBase.directorPrompt,
    exactEndStateRequired,
  });

  const motionComplexity = classifyMotionComplexity(intent.motion_prompt);
  const anchorRisk = deriveAnchorRiskLevel(Number(pack.readiness_score ?? 0), motionComplexity);

  const { data: anchorPack, error: anchorPackError } = await supabase
    .from("anchor_packs")
    .insert({
      pack_name: `compiled-${intent.id.slice(0, 8)}-${pack.id.slice(0, 8)}`,
      pack_type: "hybrid",
      status: "ready",
      notes: "Ephemeral compiled anchor pack for clip intent generation.",
      aggregate_stability_score: Number(pack.readiness_score ?? 0),
      is_ready: true,
      meta: {
        clip_intent_id: intent.id,
        working_pack_id: pack.id,
        source_profile_id: intent.source_profile_id,
        generation_origin: "slice_c_compiled",
        creative_fidelity_decision: fidelityPlan.decision,
        creative_fidelity_reasons: fidelityPlan.reasons,
      },
    })
    .select("id")
    .single();

  if (anchorPackError || !anchorPack) throw new Error(anchorPackError?.message ?? "Failed to create compiled anchor pack.");

  const { error: anchorItemsError } = await supabase.from("anchor_pack_items").insert(
    compileItems.map((item, index) => ({
      anchor_pack_id: anchorPack.id,
      generation_id: item.generation_id,
      role: item.role,
      sort_order: index,
      stability_score: Number(item.confidence_score ?? 0),
      notes: `compiled_from_working_pack_item:${item.id}`,
    })),
  );

  if (anchorItemsError) throw new Error(anchorItemsError.message);

  const traceabilitySnapshot = buildCompileTraceabilitySnapshot({
    clipIntentId: intent.id,
    workingPackId: pack.id,
    sourceProfileId: intent.source_profile_id,
    compiledAnchorPackId: anchorPack.id,
    workingPackReadinessScore: Number(pack.readiness_score ?? 0),
    directorPrompt: hardenedDirectorPrompt,
    fallbackPrompt: promptBase.fallbackPrompt,
    modeSelected: runtimeModeSelected,
    providerSelected: "veo-3.1",
    modelSelected: "veo-3.1",
    anchorCount: compileItems.length,
    fidelityPlan: {
      decision: fidelityPlan.decision,
      reasons: fidelityPlan.reasons,
      warnings: fidelityPlan.warnings,
      recommendedMode: fidelityPlan.recommendedMode,
    },
  });

  const { data: generationPlan, error: generationPlanError } = await supabase
    .from("video_generation_plans")
    .insert({
      motion_request: intent.motion_prompt,
      mode_selected: runtimeModeSelected,
      why_mode_selected: `Compiled from working pack ${pack.id} with readiness ${Number(pack.readiness_score ?? 0).toFixed(2)} and creative fidelity decision ${fidelityPlan.decision}.`,
      recommended_pack_ids: [anchorPack.id],
      required_reference_roles: requiredRoles,
      duration_seconds: Number(intent.duration_seconds ?? 8),
      aspect_ratio: intent.aspect_ratio || "9:16",
      motion_complexity: motionComplexity,
      anchor_risk_level: anchorRisk,
      director_prompt: hardenedDirectorPrompt,
      fallback_prompt: promptBase.fallbackPrompt,
      negative_constraints: [
        "Do not alter facial geometry.",
        "Do not change garment fit or print alignment.",
        "Do not introduce scene swaps or aggressive camera jumps.",
      ],
      provider_order: ["veo-3.1", "veo-3.1-fast", "veo-2"],
      planner_model: "slice-c-compiler",
      planner_version: "slice-c-compiler-v1",
      debug_trace: traceabilitySnapshot,
    })
    .select("id")
    .single();

  if (generationPlanError || !generationPlan) throw new Error(generationPlanError?.message ?? "Failed to create generation plan.");

  const runRequest: ExecuteVideoRunRequest = {
    generation_plan_id: generationPlan.id,
    selected_pack_id: anchorPack.id,
    mode_selected: runtimeModeSelected,
    provider_selected: "veo-3.1",
    model_selected: "veo-3.1",
    director_prompt: hardenedDirectorPrompt,
    fallback_prompt: promptBase.fallbackPrompt,
    aspect_ratio: intent.aspect_ratio || "9:16",
    duration_seconds: Number(intent.duration_seconds ?? 8),
    request_payload_snapshot: {
      ...traceabilitySnapshot,
      template_mode: selectedTemplate
        ? {
            production_mode: "phase1_template",
            template_id: selectedTemplate.template_id,
            mode_preference: selectedTemplate.mode_preference,
            required_roles: selectedTemplate.required_roles,
            requires_exact_end_state: selectedTemplate.requires_exact_end_state,
          }
        : { production_mode: "experimental_freeform" },
      runtime_fidelity: {
        ...buildRuntimeFidelityMetadata({
          exactEndStateRequired,
          startFrameGenerationId: frameSelection.startFrameGenerationId,
          endFrameGenerationId: frameSelection.endFrameGenerationId,
        }),
        exact_end_state_reason: frameSelection.exactEndStateReason,
        start_frame_generation_id: frameSelection.startFrameGenerationId,
        end_frame_generation_id: frameSelection.endFrameGenerationId,
        start_frame_role: frameSelection.startRole,
        end_frame_role: frameSelection.endRole,
        used_verified_front_back_pair: frameSelection.usedVerifiedFrontBackPair,
        prioritized_verified_anchor_generation_ids: getVerifiedAnchorIds(items),
      },
    },
  };

  const { error: intentUpdateError } = await supabase
    .from("clip_intents")
    .update({
      compiled_anchor_pack_id: anchorPack.id,
      compiled_run_request: runRequest,
      last_compiled_at: new Date().toISOString(),
    })
    .eq("id", intent.id);

  if (intentUpdateError) throw new Error(intentUpdateError.message);

  return {
    clipIntentId: intent.id,
    workingPackId: pack.id,
    sourceProfileId: intent.source_profile_id,
    compiledAnchorPackId: anchorPack.id,
    warnings,
    runRequest,
  };
}
