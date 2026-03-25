import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type PackReuseCandidate = {
  generation_id: string;
  source: "primary" | "additional";
  score: number;
};

export async function resolveReuseCandidates(input: { sourceProfileId: string }) {
  const supabase = getSupabaseAdminClient();
  const { data: profile, error } = await supabase
    .from("clip_source_profiles")
    .select("id,primary_generation_id,additional_generation_ids")
    .eq("id", input.sourceProfileId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!profile) throw new Error("Source profile not found.");

  const additionalIds = Array.isArray(profile.additional_generation_ids)
    ? profile.additional_generation_ids.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];

  const deduped = Array.from(new Set([profile.primary_generation_id, ...additionalIds]));

  const candidates: PackReuseCandidate[] = deduped.map((generationId, index) => ({
    generation_id: generationId,
    source: generationId === profile.primary_generation_id ? "primary" : "additional",
    score: generationId === profile.primary_generation_id ? 0.95 : Number(Math.max(0.6, 0.85 - index * 0.05).toFixed(4)),
  }));

  return {
    profile,
    candidates,
  };
}
