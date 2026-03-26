import type { ExpansionProvenance } from "@/lib/video/v2/anchorExpansion/types";

export const SKU_TRUTH_PROVENANCE = ["sku_verified_truth", "manual_verified_override"] as const;
export type SkuTruthProvenance = (typeof SKU_TRUTH_PROVENANCE)[number];

export const SKU_TRUTH_ROLES = [
  "front",
  "back",
  "left_profile",
  "right_profile",
  "three_quarter_left",
  "three_quarter_right",
  "detail",
  "fit_anchor",
  "context",
] as const;
export type SkuTruthRole = (typeof SKU_TRUTH_ROLES)[number];

export type SkuTruthRegistryEntry = {
  id: string;
  sku_code: string;
  role: string;
  generation_id: string;
  source_kind: SkuTruthProvenance;
  is_verified: boolean;
  label: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkingPackTruthAttachment = {
  role: string;
  generation_id: string;
  source_kind: ExpansionProvenance;
  action: "inserted" | "updated" | "skipped";
  reason?: string;
};
