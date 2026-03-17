import { HardPreservationRules, WorkflowProfile } from "@/lib/tryon/types";

export function buildForbiddenTransformations(input: {
  garmentCategory?: string | null;
  garmentName?: string | null;
  workflowProfile: WorkflowProfile;
  hardPreservationRules: HardPreservationRules;
  readinessMissing?: string[];
}): string[] {
  const forbidden = new Set<string>();
  const text = `${input.garmentCategory ?? ""} ${input.garmentName ?? ""}`.toLowerCase();

  if (input.workflowProfile.shouldUseCatalogRules) {
    forbidden.add("do_not_convert_to_bikini");
    forbidden.add("do_not_convert_to_monokini");
    forbidden.add("do_not_convert_to_halter_one_piece");
    forbidden.add("do_not_reduce_coverage");
    forbidden.add("do_not_change_primary_neckline_shape");
    forbidden.add("do_not_change_print_family");
  }

  if (input.hardPreservationRules.preserveSleeveShape) forbidden.add("do_not_remove_flutter_sleeves");
  if (input.hardPreservationRules.preserveBustConstruction) forbidden.add("do_not_change_twist_front_bust");
  if (input.hardPreservationRules.preserveSkirtPresence || text.includes("dress")) forbidden.add("do_not_remove_skirted_hem");
  if (input.readinessMissing?.includes("primary_front")) forbidden.add("do_not_attempt_style_transfer_without_front_reference");

  return [...forbidden];
}
