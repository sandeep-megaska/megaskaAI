export type ImageProjectTruthSaveInput = {
  generationId: string;
  skuCode: string;
  role: string;
  truthType: "sku_verified_truth" | "manual_verified_override";
};

export function buildImageProjectSkuTruthPayload(input: ImageProjectTruthSaveInput) {
  return {
    sku_code: input.skuCode.trim().toUpperCase(),
    role: input.role.trim(),
    generation_id: input.generationId.trim(),
    source_kind: input.truthType,
    label: "Saved from Image Project",
  };
}

