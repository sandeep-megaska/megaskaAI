import assert from "node:assert/strict";
import { reusePackAnchorsForTest } from "@/lib/video/v2/packReuse/reuse";
import type { PackReuseContext, ReuseCandidateRecord } from "@/lib/video/v2/packReuse/types";

function buildContext(overrides?: Partial<PackReuseContext>): PackReuseContext {
  return {
    clipIntentId: "clip-1",
    workingPackId: "pack-current",
    sourceProfileId: "profile-1",
    motionPrompt: "model turns and shows the back design",
    planner: {
      clipIntentId: "clip-1",
      workingPackId: "pack-current",
      decision: "block",
      recommendedMode: "ingredients_to_video",
      reasons: ["back missing"],
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
      { id: "item-front", role: "front", generation_id: "gen-front", source_kind: "reused", confidence_score: 0.92 },
      { id: "item-fit", role: "fit_anchor", generation_id: "gen-fit", source_kind: "reused", confidence_score: 0.88 },
    ],
    sourceProfile: {
      profile_name: "Model A",
      primary_generation_id: "gen-front",
      additional_generation_ids: ["gen-fit"],
      garment_notes: "same garment",
      subject_notes: "same model",
      scene_notes: "studio",
    },
    referenceUrls: [],
    ...overrides,
  };
}

function candidate(overrides?: Partial<ReuseCandidateRecord>): ReuseCandidateRecord {
  return {
    role: "back",
    generation_id: "gen-back-1",
    source_kind: "expanded_generated",
    confidence_score: 0.9,
    item_id: "item-back-source",
    working_pack_id: "pack-old",
    source_profile_id: "profile-1",
    clip_intent_id: "clip-old",
    created_at: "2026-03-24T00:00:00.000Z",
    source_generation_id: "gen-front",
    provenance: "expanded_generated",
    quality_score: 0.9,
    ...overrides,
  };
}

void (async () => {
  const persistedRoles: string[] = [];

  const exactBackReuse = await reusePackAnchorsForTest(buildContext(), undefined, {
    findCandidates: async () => [candidate()],
    persistReuse: async ({ role }) => {
      persistedRoles.push(role);
      return { working_pack_item_id: `persisted-${role}` };
    },
  });
  assert.deepEqual(exactBackReuse.roles_reused, ["back"]);
  assert.equal(exactBackReuse.decisions[0]?.decision, "reuse");

  const weakCriticalRejected = await reusePackAnchorsForTest(buildContext(), ["back"], {
    findCandidates: async () => [candidate({ source_profile_id: "other-profile", source_generation_id: "other-gen" })],
    persistReuse: async () => ({ working_pack_item_id: "never" }),
  });
  assert.deepEqual(weakCriticalRejected.roles_unresolved, ["back"]);
  assert.equal(weakCriticalRejected.decisions[0]?.decision, "fallback_to_expand");

  const detailReused = await reusePackAnchorsForTest(
    buildContext({ planner: { ...buildContext().planner, missingRoles: ["detail"], criticalMissingRoles: [], requiredRoles: ["front", "fit_anchor", "detail"] } }),
    undefined,
    {
      findCandidates: async () => [candidate({ role: "detail", generation_id: "gen-detail-1", item_id: "item-detail", source_kind: "reused" })],
      persistReuse: async ({ role }) => ({ working_pack_item_id: `persisted-${role}` }),
    },
  );
  assert.deepEqual(detailReused.roles_reused, ["detail"]);

  const partialReuse = await reusePackAnchorsForTest(
    buildContext({ planner: { ...buildContext().planner, missingRoles: ["back", "detail"], criticalMissingRoles: ["back"], requiredRoles: ["front", "fit_anchor", "back", "detail"] } }),
    undefined,
    {
      findCandidates: async (_, role) => (role === "back" ? [candidate()] : []),
      persistReuse: async ({ role }) => ({ working_pack_item_id: `persisted-${role}` }),
    },
  );
  assert.deepEqual(partialReuse.roles_reused, ["back"]);
  assert.deepEqual(partialReuse.roles_unresolved, ["detail"]);


  const verifiedPriority = await reusePackAnchorsForTest(buildContext(), ["back"], {
    findCandidates: async () => [
      candidate({ generation_id: "gen-expanded", source_kind: "expanded_generated", confidence_score: 0.96, quality_score: 0.96, item_id: "expanded" }),
      candidate({ generation_id: "gen-verified", source_kind: "manual_verified_override", confidence_score: 1, quality_score: 1, item_id: "verified" }),
    ],
    persistReuse: async ({ candidate: picked }) => {
      assert.equal(picked.provenance, "manual_verified_override");
      return { working_pack_item_id: "persisted-back" };
    },
  });
  assert.equal(verifiedPriority.decisions[0]?.chosen_candidate?.provenance, "manual_verified_override");

  const fallbackNoCandidates = await reusePackAnchorsForTest(buildContext(), undefined, {
    findCandidates: async () => [],
    persistReuse: async () => ({ working_pack_item_id: "never" }),
  });
  assert.equal(fallbackNoCandidates.decisions[0]?.decision, "fallback_to_expand");

  const synthesizedCriticalRejected = await reusePackAnchorsForTest(buildContext(), ["back"], {
    findCandidates: async () => [candidate({ source_kind: "synthesized", confidence_score: 0.95, quality_score: 0.95 })],
    persistReuse: async () => ({ working_pack_item_id: "never" }),
  });
  assert.equal(synthesizedCriticalRejected.roles_reused.length, 0);
  assert.equal(synthesizedCriticalRejected.decisions[0]?.decision, "fallback_to_expand");

  assert.ok(persistedRoles.includes("back"));
})();
