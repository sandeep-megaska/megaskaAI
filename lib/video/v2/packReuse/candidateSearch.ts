import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { PackReuseContext, ReuseCandidateRecord } from "@/lib/video/v2/packReuse/types";

type WorkingPackRow = { id: string; clip_intent_id: string; source_profile_id: string; created_at: string };
type WorkingPackItemRow = {
  id: string;
  working_pack_id: string;
  role: string;
  generation_id: string | null;
  source_kind: string;
  confidence_score: number | null;
  created_at: string;
};
type GenerationRow = { id: string; source_generation_id: string | null; video_meta: Record<string, unknown> | null };

function provenanceFrom(sourceKind: string) {
  if (sourceKind === "expanded_generated") return "expanded_generated" as const;
  if (sourceKind === "synthesized") return "synthesized_support" as const;
  return "reused_existing" as const;
}

export async function findReuseCandidates(context: PackReuseContext, role: string): Promise<ReuseCandidateRecord[]> {
  const supabase = getSupabaseAdminClient();

  const { data: packs, error: packError } = await supabase
    .from("working_packs")
    .select("id,clip_intent_id,source_profile_id,created_at")
    .eq("source_profile_id", context.sourceProfileId)
    .neq("id", context.workingPackId)
    .order("created_at", { ascending: false })
    .limit(25)
    .returns<WorkingPackRow[]>();

  if (packError) throw new Error(packError.message);
  if (!packs?.length) return [];

  const packLookup = new Map(packs.map((pack) => [pack.id, pack]));
  const packIds = packs.map((pack) => pack.id);

  const roles = role === "three_quarter_side" ? ["three_quarter_left", "three_quarter_right"] : [role];

  const { data: items, error: itemError } = await supabase
    .from("working_pack_items")
    .select("id,working_pack_id,role,generation_id,source_kind,confidence_score,created_at")
    .in("working_pack_id", packIds)
    .in("role", roles)
    .not("generation_id", "is", null)
    .returns<WorkingPackItemRow[]>();

  if (itemError) throw new Error(itemError.message);
  if (!items?.length) return [];

  const generationIds = [...new Set(items.map((item) => item.generation_id).filter((id): id is string => Boolean(id)))];
  const { data: generations, error: generationError } = await supabase
    .from("generations")
    .select("id,source_generation_id,video_meta")
    .in("id", generationIds)
    .returns<GenerationRow[]>();

  if (generationError) throw new Error(generationError.message);
  const generationLookup = new Map((generations ?? []).map((generation) => [generation.id, generation]));

  return items
    .map((item) => {
      const pack = packLookup.get(item.working_pack_id);
      const generation = item.generation_id ? generationLookup.get(item.generation_id) : null;
      const videoMeta = generation?.video_meta ?? null;
      const sourceProfileId = typeof videoMeta?.source_profile_id === "string" ? videoMeta.source_profile_id : (pack?.source_profile_id ?? context.sourceProfileId);

      return {
        role: item.role,
        generation_id: item.generation_id as string,
        source_kind: item.source_kind,
        confidence_score: Number(item.confidence_score ?? 0),
        item_id: item.id,
        working_pack_id: item.working_pack_id,
        source_profile_id: sourceProfileId,
        clip_intent_id: pack?.clip_intent_id ?? context.clipIntentId,
        created_at: item.created_at,
        source_generation_id: generation?.source_generation_id ?? null,
        provenance: provenanceFrom(item.source_kind),
        quality_score: Number(item.confidence_score ?? 0),
      } satisfies ReuseCandidateRecord;
    })
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}
