import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { resolveReuseCandidates } from "@/lib/video/v2/packReuse";
import { assignRolesFromCandidates } from "@/lib/video/v2/roleAssigner";

export async function autoBuildWorkingPack(input: { clipIntentId: string }) {
  const supabase = getSupabaseAdminClient();

  const { data: intent, error: intentError } = await supabase
    .from("clip_intents")
    .select("id,source_profile_id,motion_prompt,aspect_ratio,duration_seconds,status")
    .eq("id", input.clipIntentId)
    .maybeSingle();

  if (intentError) throw new Error(intentError.message);
  if (!intent) throw new Error("Clip intent not found.");

  const { profile, candidates } = await resolveReuseCandidates({ sourceProfileId: intent.source_profile_id });
  const assignment = assignRolesFromCandidates({ candidates, motionPrompt: intent.motion_prompt });

  const readinessScore = Number(
    (
      assignment.assigned.reduce((sum, item) => sum + Number(item.confidence_score ?? 0), 0) /
      Math.max(assignment.assigned.length, 1)
    ).toFixed(4),
  );

  const warnings = [...assignment.warnings];
  if (!assignment.assigned.find((item) => item.role === "front")) {
    warnings.push("front role is missing.");
  }
  if (!assignment.assigned.find((item) => item.role === "fit_anchor")) {
    warnings.push("fit_anchor role is missing.");
  }

  const status = readinessScore >= 0.7 ? "ready" : "needs_review";

  const { data: createdPack, error: packError } = await supabase
    .from("working_packs")
    .insert({
      source_profile_id: intent.source_profile_id,
      clip_intent_id: intent.id,
      status,
      readiness_score: readinessScore,
      warning_messages: warnings,
      pack_meta: {
        motion_prompt: intent.motion_prompt,
        aspect_ratio: intent.aspect_ratio,
        duration_seconds: intent.duration_seconds,
      },
    })
    .select("id,source_profile_id,clip_intent_id,status,readiness_score,warning_messages,pack_meta,created_at,updated_at")
    .single();

  if (packError) throw new Error(packError.message);

  const itemRows = assignment.assigned.map((item, index) => ({
    working_pack_id: createdPack.id,
    role: item.role,
    generation_id: item.generation_id,
    source_kind: item.source_kind,
    synthetic_prompt: item.synthetic_prompt ?? null,
    confidence_score: item.confidence_score,
    sort_order: index,
    item_meta: { source: item.source_kind },
  }));

  const { data: createdItems, error: itemError } = await supabase
    .from("working_pack_items")
    .insert(itemRows)
    .select("id,working_pack_id,role,generation_id,source_kind,synthetic_prompt,confidence_score,sort_order,item_meta,created_at,updated_at");

  if (itemError) throw new Error(itemError.message);

  const lineageRows = (createdItems ?? []).map((item) => ({
    working_pack_id: createdPack.id,
    working_pack_item_id: item.id,
    source_generation_id: item.generation_id ?? profile.primary_generation_id,
    derived_generation_id: item.generation_id,
    lineage_type: item.source_kind === "synthesized" ? "synthesized" : "reuse",
    lineage_meta: {
      role: item.role,
      source_kind: item.source_kind,
      synthetic_prompt: item.synthetic_prompt,
    },
  }));

  if (lineageRows.length) {
    const { error: lineageError } = await supabase.from("pack_lineage").insert(lineageRows);
    if (lineageError) throw new Error(lineageError.message);
  }

  await supabase.from("clip_intents").update({ status: "built" }).eq("id", intent.id);

  return {
    pack: createdPack,
    items: createdItems ?? [],
    readiness: {
      score: readinessScore,
      warnings,
      is_ready: status === "ready",
    },
  };
}
