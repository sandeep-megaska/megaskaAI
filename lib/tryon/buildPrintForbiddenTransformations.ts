import { PrintPreservationRules } from "@/lib/tryon/types";

export function buildPrintForbiddenTransformations(input: {
  rules: PrintPreservationRules;
  garment?: { printType?: string | null };
  hasWeakPrintReferences?: boolean;
}) {
  const forbidden = new Set<string>();

  if (input.rules.preserveColorFamily) {
    forbidden.add("do_not_shift_to_unrelated_color_family");
  }
  if (input.rules.preservePrintPattern) {
    forbidden.add("do_not_convert_to_solid_color");
    forbidden.add("do_not_replace_pattern_family");
  }
  if (input.rules.preservePrintDensity) {
    forbidden.add("do_not_reduce_pattern_density");
    forbidden.add("do_not_flatten_multicolor_print");
  }
  if (input.rules.preservePrintDistribution) {
    forbidden.add("do_not_simplify_distribution_of_print");
    forbidden.add("do_not_remove_print_from_bust_or_skirt_sections");
  }
  if (input.rules.preservePatternScale) {
    forbidden.add("do_not_convert_to_minimal_pattern");
    forbidden.add("do_not_change_pattern_scale_without_reference_support");
  }
  if (input.rules.preserveTextureRichness) {
    forbidden.add("do_not_replace_floral_print_with_generic_texture");
    forbidden.add("do_not_flatten_fabric_texture_depth");
  }

  if (input.hasWeakPrintReferences) {
    forbidden.add("print_lock_low_confidence_reference_set");
  }

  return Array.from(forbidden);
}
