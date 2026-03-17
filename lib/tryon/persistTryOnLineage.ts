import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function persistTryOnLineage(input: {
  tryonJobId: string;
  selectedSubjectMode: string;
  selectedGarmentAssetIds: string[];
  selectedPrimaryFrontAssetId: string | null;
  selectedPrimaryBackAssetId: string | null;
  selectedDetailAssetIds: string[];
  selectedReferenceBundle: Record<string, unknown>;
  orchestrationDebug: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from("tryon_jobs")
    .update({
      selected_subject_mode: input.selectedSubjectMode,
      selected_garment_asset_ids: input.selectedGarmentAssetIds,
      selected_primary_front_asset_id: input.selectedPrimaryFrontAssetId,
      selected_primary_back_asset_id: input.selectedPrimaryBackAssetId,
      selected_detail_asset_ids: input.selectedDetailAssetIds,
      selected_reference_bundle: input.selectedReferenceBundle,
      orchestration_debug: input.orchestrationDebug,
    })
    .eq("id", input.tryonJobId);

  if (error) {
    throw new Error(`Unable to persist try-on lineage: ${error.message}`);
  }
}
