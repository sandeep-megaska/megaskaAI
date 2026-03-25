import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { persistCreativeFidelityPlan } from "@/lib/video/v2/creativeFidelity/persistence";
import { planCreativeFidelity } from "@/lib/video/v2/creativeFidelity/planner";
import type { AnchorExpansionContext, WorkingPackExpansionItem } from "@/lib/video/v2/anchorExpansion/types";

type ClipIntentRow = {
  id: string;
  source_profile_id: string;
  motion_prompt: string;
};

type SourceProfileRow = {
  id: string;
  profile_name: string;
  primary_generation_id: string;
  additional_generation_ids: string[] | null;
  subject_notes?: string | null;
  garment_notes?: string | null;
  scene_notes?: string | null;
};

type GenerationUrlRow = {
  id: string;
  asset_url: string | null;
  url: string | null;
};

export async function buildAnchorExpansionContext(clipIntentId: string): Promise<AnchorExpansionContext> {
  const supabase = getSupabaseAdminClient();

  const { data: intent, error: intentError } = await supabase
    .from("clip_intents")
    .select("id,source_profile_id,motion_prompt")
    .eq("id", clipIntentId)
    .maybeSingle<ClipIntentRow>();

  if (intentError) throw new Error(intentError.message);
  if (!intent) throw new Error("Clip intent not found.");

  const { data: packs, error: packError } = await supabase
    .from("working_packs")
    .select("id")
    .eq("clip_intent_id", intent.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (packError) throw new Error(packError.message);
  const packId = packs?.[0]?.id;
  if (!packId) throw new Error("No working pack found for this clip intent.");

  const { data: rawItems, error: itemsError } = await supabase
    .from("working_pack_items")
    .select("id,role,generation_id,source_kind,confidence_score,item_meta")
    .eq("working_pack_id", packId)
    .order("sort_order", { ascending: true });

  if (itemsError) throw new Error(itemsError.message);
  const items = (rawItems ?? []) as WorkingPackExpansionItem[];

  const { data: sourceProfile, error: sourceProfileError } = await supabase
    .from("clip_source_profiles")
    .select("id,profile_name,primary_generation_id,additional_generation_ids,subject_notes,garment_notes,scene_notes")
    .eq("id", intent.source_profile_id)
    .maybeSingle<SourceProfileRow>();

  if (sourceProfileError) throw new Error(sourceProfileError.message);
  if (!sourceProfile) throw new Error("Source profile not found.");

  const planner = planCreativeFidelity({
    clipIntentId: intent.id,
    workingPackId: packId,
    motionPrompt: intent.motion_prompt,
    items: items.map((item) => ({ role: item.role, generation_id: item.generation_id, source_kind: item.source_kind })),
  });

  await persistCreativeFidelityPlan(supabase, planner);

  const candidateGenerationIds = new Set<string>([sourceProfile.primary_generation_id]);
  for (const id of sourceProfile.additional_generation_ids ?? []) if (id) candidateGenerationIds.add(id);
  for (const item of items) if (item.generation_id) candidateGenerationIds.add(item.generation_id);

  const { data: refs, error: refsError } = await supabase
    .from("generations")
    .select("id,asset_url,url")
    .in("id", [...candidateGenerationIds])
    .returns<GenerationUrlRow[]>();

  if (refsError) throw new Error(refsError.message);

  const referenceUrls = (refs ?? [])
    .map((row) => row.asset_url ?? row.url)
    .filter((value): value is string => Boolean(value));

  return {
    clipIntentId: intent.id,
    workingPackId: packId,
    sourceProfileId: sourceProfile.id,
    motionPrompt: intent.motion_prompt,
    planner,
    items,
    sourceProfile: {
      profile_name: sourceProfile.profile_name,
      primary_generation_id: sourceProfile.primary_generation_id,
      additional_generation_ids: sourceProfile.additional_generation_ids ?? [],
      subject_notes: sourceProfile.subject_notes,
      garment_notes: sourceProfile.garment_notes,
      scene_notes: sourceProfile.scene_notes,
    },
    referenceUrls,
  };
}
