import assert from "node:assert/strict";
import { evaluateExpansionEligibility } from "@/lib/video/v2/anchorExpansion/eligibility";
import { expandMissingAnchorsForTest } from "@/lib/video/v2/anchorExpansion/expand";
import type { AnchorExpansionContext } from "@/lib/video/v2/anchorExpansion/types";

function buildContext(overrides?: Partial<AnchorExpansionContext>): AnchorExpansionContext {
  return {
    clipIntentId: "clip-1",
    workingPackId: "pack-1",
    sourceProfileId: "profile-1",
    motionPrompt: "model turns and shows the back design",
    planner: {
      clipIntentId: "clip-1",
      workingPackId: "pack-1",
      decision: "block",
      recommendedMode: "ingredients_to_video",
      reasons: ["Back view is required for this shot but no real back anchor is available."],
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
      allowedSynthesisRoles: ["detail"],
    },
    items: [
      { id: "i-front", role: "front", generation_id: "g-front", source_kind: "reused", confidence_score: 0.91 },
      { id: "i-fit", role: "fit_anchor", generation_id: "g-fit", source_kind: "reused", confidence_score: 0.87 },
      { id: "i-left", role: "three_quarter_left", generation_id: "g-left", source_kind: "reused", confidence_score: 0.79 },
    ],
    sourceProfile: {
      profile_name: "Studio model",
      primary_generation_id: "g-front",
      additional_generation_ids: ["g-fit"],
      garment_notes: "minimal clean sheath dress",
      scene_notes: "studio",
      subject_notes: "same model",
    },
    referenceUrls: ["https://example.com/front.jpg", "https://example.com/fit.jpg"],
    ...overrides,
  };
}

void (async () => {
  const eligibleBack = evaluateExpansionEligibility(buildContext(), "back");
  assert.equal(eligibleBack.eligible_for_expansion, true);

  const ineligibleBack = evaluateExpansionEligibility(
    buildContext({
      items: [{ id: "i-front", role: "front", generation_id: "g-front", source_kind: "reused", confidence_score: 0.42 }],
      sourceProfile: {
        profile_name: "Weak profile",
        primary_generation_id: "g-front",
        additional_generation_ids: [],
        garment_notes: "layered strappy open-back dress",
      },
    }),
    "back",
  );
  assert.equal(ineligibleBack.eligible_for_expansion, false);

  const sideEligible = evaluateExpansionEligibility(
    buildContext({ planner: { ...buildContext().planner, missingRoles: ["three_quarter_right"], criticalMissingRoles: [] } }),
    "three_quarter_right",
  );
  assert.equal(sideEligible.eligible_for_expansion, true);

  const detailEligible = evaluateExpansionEligibility(
    buildContext({
      planner: {
        ...buildContext().planner,
        missingRoles: ["detail"],
        criticalMissingRoles: ["detail"],
        requiredRoles: ["front", "fit_anchor", "detail"],
      },
      motionPrompt: "close-up texture detail while model breathes",
    }),
    "detail",
  );
  assert.equal(detailEligible.eligible_for_expansion, true);

  const insufficientTruth = evaluateExpansionEligibility(
    buildContext({
      items: [{ id: "i-front", role: "front", generation_id: "g-front", source_kind: "synthesized", confidence_score: 0.4 }],
      sourceProfile: {
        profile_name: "weak",
        primary_generation_id: "g-front",
        additional_generation_ids: [],
      },
    }),
    "back",
  );
  assert.equal(insufficientTruth.eligible_for_expansion, false);


  const verifiedBackBlocked = evaluateExpansionEligibility(
    buildContext({
      items: [
        { id: "i-front", role: "front", generation_id: "g-front", source_kind: "reused", confidence_score: 0.91 },
        { id: "i-fit", role: "fit_anchor", generation_id: "g-fit", source_kind: "reused", confidence_score: 0.87 },
        { id: "i-back", role: "back", generation_id: "g-back-real", source_kind: "sku_verified_truth", confidence_score: 1 },
      ],
      planner: {
        ...buildContext().planner,
        missingRoles: ["detail"],
        criticalMissingRoles: [],
        requiredRoles: ["front", "fit_anchor", "back", "detail"],
      },
    }),
    "back",
  );
  assert.equal(verifiedBackBlocked.eligible_for_expansion, false);

  const noMissing = await expandMissingAnchorsForTest(
    buildContext({ planner: { ...buildContext().planner, missingRoles: [] } }),
    undefined,
    {},
  );
  assert.equal(noMissing.decision, "not_needed");

  const partialExpanded = await expandMissingAnchorsForTest(
    buildContext({
      planner: {
        ...buildContext().planner,
        missingRoles: ["back", "detail"],
        criticalMissingRoles: ["back"],
        requiredRoles: ["front", "fit_anchor", "back", "detail"],
      },
      items: [
        { id: "i-front", role: "front", generation_id: "g-front", source_kind: "reused", confidence_score: 0.91 },
        { id: "i-fit", role: "fit_anchor", generation_id: "g-fit", source_kind: "reused", confidence_score: 0.87 },
        { id: "i-back", role: "back", generation_id: "g-back-real", source_kind: "manual_verified_override", confidence_score: 1 },
      ],
    }),
    undefined,
    {
      generate: async () => ({ bytes: Buffer.from("fake"), mimeType: "image/png", backendId: "gemini", backendModel: "gemini-2.5" }),
      persist: async () => ({ generationId: "gen-detail-1", assetId: "gen-detail-1" }),
    },
  );
  assert.equal((partialExpanded.roles_created as string[]).some((role) => role === "detail"), true);
  assert.equal((partialExpanded.roles_created as string[]).some((role) => role === "back"), false);

  const expanded = await expandMissingAnchorsForTest(buildContext(), undefined, {
    generate: async () => ({ bytes: Buffer.from("fake"), mimeType: "image/png", backendId: "gemini", backendModel: "gemini-2.5" }),
    persist: async () => ({ generationId: "gen-back-1", assetId: "gen-back-1" }),
  });
  assert.equal(expanded.decision, "expanded");
  assert.deepEqual(expanded.roles_created, ["back"]);
})();
