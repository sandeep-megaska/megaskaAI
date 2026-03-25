import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { AnchorExpansionContext, ExpandedAnchorPersistence, ExpansionGenerationOutput } from "@/lib/video/v2/anchorExpansion/types";

function fileExtensionForMime(mimeType: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
}

export async function persistExpandedAnchor(input: {
  context: AnchorExpansionContext;
  role: string;
  prompt: string;
  eligibilityReason: string;
  generated: ExpansionGenerationOutput;
}): Promise<ExpandedAnchorPersistence> {
  const supabase = getSupabaseAdminClient();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "brand-assets";
  const ext = fileExtensionForMime(input.generated.mimeType);
  const storagePath = `image/v2/anchor-expansion/${input.context.clipIntentId}/${input.role}-${Date.now()}-${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, input.generated.bytes, {
    contentType: input.generated.mimeType,
    upsert: false,
  });
  if (uploadError) throw new Error(`Supabase upload failed: ${uploadError.message}`);

  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  if (!publicData?.publicUrl) throw new Error("Unable to resolve expanded anchor URL.");

  const { data: generation, error: generationError } = await supabase
    .from("generations")
    .insert({
      prompt: input.prompt,
      type: "Image",
      media_type: "Image",
      status: "completed",
      generation_kind: "image",
      source_generation_id: input.context.sourceProfile.primary_generation_id,
      asset_url: publicData.publicUrl,
      url: publicData.publicUrl,
      overlay_json: {
        generation_origin: "slice_e_anchor_expansion",
        expansion_role: input.role,
        clip_intent_id: input.context.clipIntentId,
        working_pack_id: input.context.workingPackId,
        eligibility_reason: input.eligibilityReason,
        planner_decision: input.context.planner.decision,
        planner_missing_roles: input.context.planner.missingRoles,
      },
      video_meta: {
        source_profile_id: input.context.sourceProfileId,
        clip_intent_id: input.context.clipIntentId,
        working_pack_id: input.context.workingPackId,
        expanded_role: input.role,
        generation_origin: "slice_e_anchor_expansion",
      },
    })
    .select("id")
    .single<{ id: string }>();

  if (generationError || !generation) throw new Error(generationError?.message ?? "Failed to persist expanded generation.");

  const itemMeta = {
    source: "expanded_generated",
    generation_origin: "slice_e_anchor_expansion",
    expansion_role: input.role,
    source_profile_id: input.context.sourceProfileId,
  };

  const existingItem = input.context.items.find((item) => item.role === input.role);
  if (existingItem) {
    const { error: updateError } = await supabase
      .from("working_pack_items")
      .update({
        generation_id: generation.id,
        source_kind: "expanded_generated",
        confidence_score: 0.82,
        synthetic_prompt: null,
        item_meta: itemMeta,
      })
      .eq("id", existingItem.id);

    if (updateError) throw new Error(updateError.message);

    const { error: lineageError } = await supabase.from("pack_lineage").insert({
      working_pack_id: input.context.workingPackId,
      working_pack_item_id: existingItem.id,
      source_generation_id: input.context.sourceProfile.primary_generation_id,
      derived_generation_id: generation.id,
      lineage_type: "derived",
      lineage_meta: {
        source_kind: "expanded_generated",
        expansion_role: input.role,
        generation_origin: "slice_e_anchor_expansion",
      },
    });
    if (lineageError) throw new Error(lineageError.message);

    return { generationId: generation.id, assetId: generation.id };
  }

  const { data: item, error: itemError } = await supabase
    .from("working_pack_items")
    .insert({
      working_pack_id: input.context.workingPackId,
      role: input.role,
      generation_id: generation.id,
      source_kind: "expanded_generated",
      confidence_score: 0.82,
      synthetic_prompt: null,
      sort_order: input.context.items.length,
      item_meta: itemMeta,
    })
    .select("id")
    .single<{ id: string }>();

  if (itemError || !item) throw new Error(itemError?.message ?? "Failed to attach expanded anchor to working pack.");

  const { error: lineageError } = await supabase.from("pack_lineage").insert({
    working_pack_id: input.context.workingPackId,
    working_pack_item_id: item.id,
    source_generation_id: input.context.sourceProfile.primary_generation_id,
    derived_generation_id: generation.id,
    lineage_type: "derived",
    lineage_meta: {
      source_kind: "expanded_generated",
      expansion_role: input.role,
      generation_origin: "slice_e_anchor_expansion",
    },
  });
  if (lineageError) throw new Error(lineageError.message);

  return { generationId: generation.id, assetId: generation.id };
}
