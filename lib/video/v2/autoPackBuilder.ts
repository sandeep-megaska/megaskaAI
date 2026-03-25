import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { resolveReuseCandidates } from "@/lib/video/v2/packReuse";
import { assignRolesFromCandidates } from "@/lib/video/v2/roleAssigner";
import { randomUUID } from "node:crypto";

const CRITICAL_SYNTHESIS_ROLES = new Set(["front", "fit_anchor"]);

function fileExtensionForMime(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function guessMimeTypeFromUrl(url: string) {
  const lower = url.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function persistSynthesizedGeneration(input: {
  sourceGenerationId: string;
  sourceProfileId: string;
  clipIntentId: string;
  workingPackId: string;
  role: string;
  syntheticPrompt: string;
}) {
  const supabase = getSupabaseAdminClient();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "brand-assets";

  const { data: sourceGeneration, error: sourceError } = await supabase
    .from("generations")
    .select("id,prompt,asset_url,url")
    .eq("id", input.sourceGenerationId)
    .maybeSingle<{ id: string; prompt: string | null; asset_url: string | null; url: string | null }>();

  if (sourceError) throw new Error(sourceError.message);
  if (!sourceGeneration) {
    throw new Error(`Source generation ${input.sourceGenerationId} was not found.`);
  }

  const sourceUrl = sourceGeneration.asset_url ?? sourceGeneration.url;
  if (!sourceUrl) throw new Error(`Source generation ${sourceGeneration.id} has no asset URL.`);

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch source generation image (${response.status}).`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get("content-type") || guessMimeTypeFromUrl(sourceUrl);
  const ext = fileExtensionForMime(mimeType);
  const filePath = `image/v2/working-pack-synthesized/${input.clipIntentId}/${input.role}-${Date.now()}-${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (uploadError) throw new Error(`Supabase upload failed: ${uploadError.message}`);

  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filePath);
  if (!publicData?.publicUrl) throw new Error("Unable to resolve synthesized generation public URL.");

  const videoMeta = {
    source_profile_id: input.sourceProfileId,
    clip_intent_id: input.clipIntentId,
    working_pack_id: input.workingPackId,
    synthesized_for_role: input.role,
    generation_origin: "slice_b_synthesized_reference",
  };

  const { data: insertedGeneration, error: insertError } = await supabase
    .from("generations")
    .insert({
      prompt: input.syntheticPrompt || sourceGeneration.prompt || `Synthesized ${input.role} reference`,
      type: "Image",
      media_type: "Image",
      status: "completed",
      generation_kind: "image",
      source_generation_id: sourceGeneration.id,
      asset_url: publicData.publicUrl,
      url: publicData.publicUrl,
      overlay_json: {
        generation_origin: "slice_b_synthesized_reference",
        source_generation_id: sourceGeneration.id,
        synthesized_for_role: input.role,
      },
      video_meta: videoMeta,
    })
    .select("id,asset_url,url,prompt")
    .single<{ id: string; asset_url: string | null; url: string | null; prompt: string | null }>();

  if (insertError || !insertedGeneration) {
    throw new Error(insertError?.message ?? "Failed to insert synthesized generation row.");
  }

  return {
    generationId: insertedGeneration.id,
    imageUrl: insertedGeneration.asset_url ?? insertedGeneration.url ?? publicData.publicUrl,
    assetUrl: insertedGeneration.asset_url ?? insertedGeneration.url ?? publicData.publicUrl,
    prompt: insertedGeneration.prompt ?? input.syntheticPrompt,
    origin: videoMeta,
  };
}

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

  const assignedWithPersistedSynth = await Promise.all(
    assignment.assigned.map(async (item) => {
      if (item.source_kind !== "synthesized") return item;

      const sourceGenerationId = profile.primary_generation_id;
      if (!sourceGenerationId) {
        warnings.push(`Unable to persist synthesized ${item.role}: source profile has no primary generation.`);
        return item;
      }

      try {
        const persisted = await persistSynthesizedGeneration({
          sourceGenerationId,
          sourceProfileId: intent.source_profile_id,
          clipIntentId: intent.id,
          workingPackId: createdPack.id,
          role: item.role,
          syntheticPrompt: item.synthetic_prompt ?? `Synthesized ${item.role} reference`,
        });

        return {
          ...item,
          generation_id: persisted.generationId,
          image_url: persisted.imageUrl,
        };
      } catch (error) {
        warnings.push(
          `Synthesized reference persistence failed for ${item.role}: ${error instanceof Error ? error.message : "unknown error"}.`,
        );
        if (CRITICAL_SYNTHESIS_ROLES.has(item.role)) {
          throw error;
        }
        return item;
      }
    }),
  );

  const itemRows = assignedWithPersistedSynth.map((item, index) => ({
    working_pack_id: createdPack.id,
    role: item.role,
    generation_id: item.generation_id,
    source_kind: item.source_kind,
    synthetic_prompt: item.synthetic_prompt ?? null,
    confidence_score: item.confidence_score,
    sort_order: index,
    item_meta: {
      source: item.source_kind,
      image_url: item.image_url ?? null,
      generation_origin: item.source_kind === "synthesized" ? "slice_b_synthesized_reference" : "reuse",
    },
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

  let packForReturn = createdPack;
  if (warnings.length !== (createdPack.warning_messages ?? []).length) {
    const { error: warningUpdateError } = await supabase
      .from("working_packs")
      .update({ warning_messages: warnings })
      .eq("id", createdPack.id);
    if (warningUpdateError) throw new Error(warningUpdateError.message);
    packForReturn = {
      ...createdPack,
      warning_messages: warnings,
    };
  }

  await supabase.from("clip_intents").update({ status: "built" }).eq("id", intent.id);

  return {
    pack: packForReturn,
    items: createdItems ?? [],
    readiness: {
      score: readinessScore,
      warnings,
      is_ready: status === "ready",
    },
  };
}
