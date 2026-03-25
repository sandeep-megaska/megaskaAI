import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { PersistReuseInput, PersistReuseResult } from "@/lib/video/v2/packReuse/types";

export async function persistReusedAnchor(input: PersistReuseInput): Promise<PersistReuseResult> {
  const supabase = getSupabaseAdminClient();
  const existing = input.context.items.find((item) => item.role === input.role);

  const itemMeta = {
    source: "reused_existing",
    reused_generation_id: input.candidate.generation_id,
    reused_from_item_id: input.candidate.source_item_id,
    reused_provenance: input.candidate.provenance,
    reuse_confidence: input.candidate.reuse_confidence,
    reuse_score: input.candidate.score,
  };

  let workingPackItemId: string;

  if (existing) {
    const { error } = await supabase
      .from("working_pack_items")
      .update({
        generation_id: input.candidate.generation_id,
        source_kind: "reused",
        synthetic_prompt: null,
        confidence_score: Number((Math.min(1, input.candidate.score / 100)).toFixed(4)),
        item_meta: itemMeta,
      })
      .eq("id", existing.id);

    if (error) throw new Error(error.message);
    workingPackItemId = existing.id;
  } else {
    const { data: inserted, error } = await supabase
      .from("working_pack_items")
      .insert({
        working_pack_id: input.context.workingPackId,
        role: input.role,
        generation_id: input.candidate.generation_id,
        source_kind: "reused",
        synthetic_prompt: null,
        confidence_score: Number((Math.min(1, input.candidate.score / 100)).toFixed(4)),
        sort_order: input.context.items.length,
        item_meta: itemMeta,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !inserted) throw new Error(error?.message ?? "Failed to persist reused anchor into working pack.");
    workingPackItemId = inserted.id;
  }

  const { error: lineageError } = await supabase.from("pack_lineage").insert({
    working_pack_id: input.context.workingPackId,
    working_pack_item_id: workingPackItemId,
    source_generation_id: input.candidate.generation_id,
    derived_generation_id: input.candidate.generation_id,
    lineage_type: "reuse",
    lineage_meta: {
      role: input.role,
      source_kind: "reused",
      reuse_confidence: input.candidate.reuse_confidence,
      reuse_score: input.candidate.score,
      source_item_id: input.candidate.source_item_id,
    },
  });

  if (lineageError) throw new Error(lineageError.message);

  return { working_pack_item_id: workingPackItemId };
}
