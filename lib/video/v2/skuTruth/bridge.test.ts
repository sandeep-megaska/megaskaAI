import assert from "node:assert/strict";
import { evaluateExpansionEligibility } from "@/lib/video/v2/anchorExpansion/eligibility";
import { planCreativeFidelity } from "@/lib/video/v2/creativeFidelity/planner";
import { attachSkuTruthToWorkingPack } from "@/lib/video/v2/skuTruth/attach";
import { buildImageProjectSkuTruthPayload } from "@/lib/video/v2/skuTruth/bridge";
import { summarizeSkuTruthCoverage } from "@/lib/video/v2/skuTruth/registry";
import { suggestRoleFromMetadata } from "@/lib/video/v2/skuTruth/ui";

function createSupabaseMock(input: {
  truthRows: Array<Record<string, unknown>>;
  workingPackItems: Array<Record<string, unknown>>;
}) {
  const state = {
    truthRows: [...input.truthRows],
    workingPackItems: [...input.workingPackItems],
  };

  return {
    state,
    from(table: string) {
      if (table === "sku_truth_registry") {
        return {
          select() {
            return {
              eq() {
                return this;
              },
              order() {
                return this;
              },
              returns() {
                return Promise.resolve({ data: state.truthRows, error: null });
              },
            };
          },
        };
      }

      if (table === "working_pack_items") {
        return {
          select() {
            return {
              eq() {
                return {
                  returns() {
                    return Promise.resolve({ data: state.workingPackItems, error: null });
                  },
                };
              },
            };
          },
          update(payload: Record<string, unknown>) {
            return {
              eq(field: string, id: string) {
                const target = state.workingPackItems.find((item) => String(item[field]) === id);
                if (target) Object.assign(target, payload);
                return Promise.resolve({ error: null });
              },
            };
          },
          insert(payload: Record<string, unknown>) {
            state.workingPackItems.push({ id: `new-${state.workingPackItems.length + 1}`, ...payload });
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`Unhandled table ${table}`);
    },
  };
}

(() => {
  const payload = buildImageProjectSkuTruthPayload({
    generationId: "gen-123",
    skuCode: " mgsw05 ",
    role: "back",
    truthType: "manual_verified_override",
  });
  assert.equal(payload.generation_id, "gen-123");
  assert.equal(payload.sku_code, "MGSW05");
  assert.equal(payload.source_kind, "manual_verified_override");
})();

(() => {
  const suggestedFromPrompt = suggestRoleFromMetadata({
    prompt: "editorial back view while model turns",
    sourceKind: "expanded_generated",
  });
  assert.equal(suggestedFromPrompt, "back");
})();

void (async () => {
  const supabase = createSupabaseMock({
    truthRows: [
      { id: "t-front", sku_code: "MGSW05", role: "front", generation_id: "gen-front", source_kind: "sku_verified_truth", is_verified: true, label: null, notes: null, created_at: "", updated_at: "" },
      { id: "t-back", sku_code: "MGSW05", role: "back", generation_id: "gen-back", source_kind: "manual_verified_override", is_verified: true, label: null, notes: null, created_at: "", updated_at: "" },
    ],
    workingPackItems: [
      { id: "wp-1", role: "front", generation_id: "older-front", source_kind: "expanded_generated", sort_order: 1 },
    ],
  });

  const attached = await attachSkuTruthToWorkingPack(supabase as never, { workingPackId: "pack-1", skuCode: "MGSW05" });
  assert.equal(attached.length, 2);
  assert.equal(attached.some((item) => item.role === "front"), true);
  assert.equal(attached.some((item) => item.role === "back"), true);

  const coverage = summarizeSkuTruthCoverage([
    { role: "front" },
    { role: "back" },
    { role: "detail" },
  ] as never);
  assert.equal(coverage.find((item) => item.role === "front")?.present, true);
  assert.equal(coverage.find((item) => item.role === "three_quarter_right")?.present, false);
})();

(() => {
  const before = planCreativeFidelity({
    clipIntentId: "clip-1",
    workingPackId: "pack-1",
    motionPrompt: "model turns and shows the back design",
    items: [
      { role: "front", generation_id: "gen-front", source_kind: "user_uploaded" },
      { role: "fit_anchor", generation_id: "gen-fit", source_kind: "user_uploaded" },
    ],
  });
  assert.equal(before.missingRoles.includes("back"), true);

  const after = planCreativeFidelity({
    clipIntentId: "clip-1",
    workingPackId: "pack-1",
    motionPrompt: "model turns and shows the back design",
    items: [
      { role: "front", generation_id: "gen-front", source_kind: "user_uploaded" },
      { role: "fit_anchor", generation_id: "gen-fit", source_kind: "user_uploaded" },
      { role: "back", generation_id: "gen-back", source_kind: "sku_verified_truth" },
    ],
  });
  assert.equal(after.missingRoles.includes("back"), false);
})();

(() => {
  const eligibility = evaluateExpansionEligibility({
    clipIntentId: "clip-1",
    workingPackId: "pack-1",
    sourceProfileId: "source-1",
    motionPrompt: "model turns and shows the back design",
    planner: {
      clipIntentId: "clip-1",
      workingPackId: "pack-1",
      decision: "block",
      recommendedMode: "ingredients_to_video",
      reasons: [],
      recommendations: [],
      warnings: [],
      riskSummary: {
        fidelityTier: "high",
        motionComplexity: "moderate",
        viewDependency: "high",
        garmentRisk: "medium",
        sceneRisk: "low",
        overallRisk: "high",
        waterExposure: false,
        surrealExposure: false,
        unsafeConcepts: [],
      },
      requiredRoles: ["front", "fit_anchor", "back"],
      missingRoles: ["back"],
      criticalMissingRoles: ["back"],
      allowedSynthesisRoles: [],
    },
    items: [
      { id: "it-front", role: "front", generation_id: "gen-front", source_kind: "user_uploaded", confidence_score: 0.88 },
      { id: "it-fit", role: "fit_anchor", generation_id: "gen-fit", source_kind: "user_uploaded", confidence_score: 0.83 },
      { id: "it-back", role: "back", generation_id: "gen-back", source_kind: "manual_verified_override", confidence_score: 1 },
    ],
    sourceProfile: {
      profile_name: "Studio",
      primary_generation_id: "gen-front",
      additional_generation_ids: ["gen-fit"],
    },
    referenceUrls: [],
  }, "back");
  assert.equal(eligibility.eligible_for_expansion, false);
})();

void (async () => {
  const supabase = createSupabaseMock({
    truthRows: [],
    workingPackItems: [
      { id: "wp-1", role: "front", generation_id: "gen-front", source_kind: "user_uploaded", sort_order: 1 },
    ],
  });
  const attached = await attachSkuTruthToWorkingPack(supabase as never, { workingPackId: "pack-1", skuCode: "MGSW05" });
  assert.deepEqual(attached, []);
})();

