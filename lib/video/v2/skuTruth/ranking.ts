import type { ExpansionProvenance } from "@/lib/video/v2/anchorExpansion/types";

const PRIORITY: Record<ExpansionProvenance, number> = {
  manual_verified_override: 100,
  sku_verified_truth: 95,
  user_uploaded: 85,
  reused_existing: 70,
  expanded_generated: 50,
  synthesized_support: 20,
};

export function truthPriorityScore(sourceKind: ExpansionProvenance) {
  return PRIORITY[sourceKind] ?? 0;
}
