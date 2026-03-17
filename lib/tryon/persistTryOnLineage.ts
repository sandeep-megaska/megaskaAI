import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function persistTryOnLineage(input: {
  tryonJobId: string;
  selectedSubjectMode: string;
  selectedGarmentAssetIds: string[];
  selectedPrimaryFrontAssetId: string | null;
  selectedPrimaryBackAssetId: string | null;
  selectedDetailAssetIds: string[];
  selectedReferenceBundle: Record<string, unknown>;
  workflowMode: string;
  fidelityLevel: string;
  printLockEnabled: boolean;
  printFidelityLevel: string;
  hardPreservationRules: Record<string, unknown>;
  printPreservationRules: Record<string, unknown>;
  forbiddenTransformations: string[];
  printForbiddenTransformations: string[];
  readinessGateResult: Record<string, unknown>;
  printGateResult: Record<string, unknown>;
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
      workflow_mode: input.workflowMode,
      fidelity_level: input.fidelityLevel,
      print_lock_enabled: input.printLockEnabled,
      print_fidelity_level: input.printFidelityLevel,
      hard_preservation_rules: input.hardPreservationRules,
      print_preservation_rules: input.printPreservationRules,
      forbidden_transformations: [...input.forbiddenTransformations, ...input.printForbiddenTransformations],
      print_gate_result: input.printGateResult,
      readiness_gate_result: input.readinessGateResult,
      orchestration_debug: input.orchestrationDebug,
    })
    .eq("id", input.tryonJobId);

  if (error) {
    throw new Error(`Unable to persist try-on lineage: ${error.message}`);
  }
}
