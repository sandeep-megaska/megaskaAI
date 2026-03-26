import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { attachSkuTruthToWorkingPack } from "@/lib/video/v2/skuTruth/attach";

export async function applySkuTruthForClipIntent(input: { clipIntentId: string; skuCode: string }) {
  const supabase = getSupabaseAdminClient();
  const normalizedSku = input.skuCode.trim().toUpperCase();

  const { data: pack, error: packError } = await supabase
    .from("working_packs")
    .select("id")
    .eq("clip_intent_id", input.clipIntentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (packError) throw new Error(packError.message);
  if (!pack) throw new Error("No working pack found for this clip intent.");

  const { error: intentError } = await supabase
    .from("clip_intents")
    .update({ sku_code: normalizedSku })
    .eq("id", input.clipIntentId);

  if (intentError) throw new Error(intentError.message);

  const attachments = await attachSkuTruthToWorkingPack(supabase, {
    workingPackId: pack.id,
    skuCode: normalizedSku,
  });

  return {
    clip_intent_id: input.clipIntentId,
    working_pack_id: pack.id,
    sku_code: normalizedSku,
    attached_roles: attachments,
  };
}
