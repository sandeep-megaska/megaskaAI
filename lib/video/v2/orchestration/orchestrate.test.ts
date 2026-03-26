import assert from "node:assert/strict";
import { buildOrchestrationPlan } from "@/lib/video/v2/orchestration/sequencing";
import type { BuildOrchestrationInput } from "@/lib/video/v2/orchestration/types";

function baseInput(overrides?: Partial<BuildOrchestrationInput>): BuildOrchestrationInput {
  return {
    planner: {
      clipIntentId: "clip-1",
      workingPackId: "pack-1",
      decision: "proceed",
      recommendedMode: "ingredients_to_video",
      reasons: ["Coverage satisfies required motion roles."],
      recommendations: ["Proceed to compile."],
      warnings: [],
      riskSummary: {
        fidelityTier: "medium",
        motionComplexity: "moderate",
        viewDependency: "medium",
        garmentRisk: "low",
        sceneRisk: "low",
        overallRisk: "medium",
        waterExposure: false,
        surrealExposure: false,
        unsafeConcepts: [],
      },
      requiredRoles: ["front", "fit_anchor"],
      missingRoles: [],
      criticalMissingRoles: [],
      allowedSynthesisRoles: ["detail"],
    },
    workingPack: {
      id: "pack-1",
      status: "ready",
      readinessScore: 0.82,
      roles: ["front", "fit_anchor"],
    },
    compileSnapshot: {
      compiledAnchorPackId: null,
      compiledAt: null,
    },
    reuseSnapshot: null,
    expansionSnapshot: null,
    ...overrides,
  };
}

void (async () => {
  const proceedReady = buildOrchestrationPlan(baseInput());
  assert.equal(proceedReady.status, "ready");
  assert.equal(proceedReady.compileReady, true);

  const blockReuseFirst = buildOrchestrationPlan(baseInput({
    planner: {
      ...baseInput().planner,
      decision: "block",
      missingRoles: ["back"],
      criticalMissingRoles: ["back"],
      requiredRoles: ["front", "fit_anchor", "back"],
      reasons: ["Back view is required for this motion."],
    },
    workingPack: {
      ...baseInput().workingPack,
      roles: ["front", "fit_anchor"],
    },
  }));
  assert.equal(blockReuseFirst.status, "needs_reuse");
  assert.equal(blockReuseFirst.steps.find((s) => s.type === "search_existing_truth")?.recommended, true);

  const noReuseExpansionEligible = buildOrchestrationPlan(baseInput({
    planner: {
      ...baseInput().planner,
      decision: "block",
      missingRoles: ["back"],
      criticalMissingRoles: ["back"],
      requiredRoles: ["front", "fit_anchor", "back"],
      reasons: ["Back view is required for this motion."],
    },
    workingPack: {
      ...baseInput().workingPack,
      roles: ["front", "fit_anchor"],
    },
    reuseSnapshot: {
      attempted: true,
      rolesReused: [],
      rolesUnresolved: ["back"],
      reasons: ["No reusable truth met deterministic thresholds."],
    },
  }));
  assert.equal(noReuseExpansionEligible.status, "needs_expansion");
  assert.equal(noReuseExpansionEligible.steps.find((s) => s.type === "expand_missing_anchors")?.status, "ready");

  const expansionIneligibleBlocked = buildOrchestrationPlan(baseInput({
    planner: {
      ...baseInput().planner,
      decision: "block",
      missingRoles: ["back"],
      criticalMissingRoles: ["back"],
      requiredRoles: ["front", "fit_anchor", "back"],
      reasons: ["Back view is required for this motion."],
    },
    reuseSnapshot: {
      attempted: true,
      rolesReused: [],
      rolesUnresolved: ["back"],
      reasons: ["No reusable truth met deterministic thresholds."],
    },
    expansionSnapshot: {
      attempted: true,
      decision: "blocked",
      rolesCreated: [],
      rolesFailed: ["back"],
      reasons: ["Back truth is not safely inferable from current references."],
    },
  }));
  assert.equal(expansionIneligibleBlocked.status, "blocked");

  const partialReuseNeedsPartialExpansion = buildOrchestrationPlan(baseInput({
    planner: {
      ...baseInput().planner,
      decision: "warn",
      missingRoles: ["back", "detail"],
      requiredRoles: ["front", "fit_anchor", "back", "detail"],
      reasons: ["Side/back support is incomplete."],
    },
    reuseSnapshot: {
      attempted: true,
      rolesReused: ["back"],
      rolesUnresolved: ["detail"],
      reasons: ["Back was reused; detail remains unresolved."],
    },
  }));
  assert.equal(partialReuseNeedsPartialExpansion.status, "needs_partial_expansion");

  const postRecoveryReady = buildOrchestrationPlan(baseInput({
    planner: {
      ...baseInput().planner,
      decision: "proceed",
      missingRoles: [],
      requiredRoles: ["front", "fit_anchor", "back"],
      reasons: ["Recovered back truth is now present."],
    },
    workingPack: {
      ...baseInput().workingPack,
      roles: ["front", "fit_anchor", "back"],
    },
    reuseSnapshot: {
      attempted: true,
      rolesReused: ["back"],
      rolesUnresolved: [],
      reasons: ["Recovered back from existing truth."],
    },
  }));
  assert.equal(postRecoveryReady.status, "ready");
  assert.equal(postRecoveryReady.compileReady, true);


  const readyAfterSkuTruth = buildOrchestrationPlan(baseInput({
    planner: {
      ...baseInput().planner,
      decision: "proceed",
      missingRoles: [],
      criticalMissingRoles: [],
      requiredRoles: ["front", "fit_anchor", "back"],
      reasons: ["Verified SKU truth attached for back role."],
    },
    workingPack: {
      ...baseInput().workingPack,
      roles: ["front", "fit_anchor", "back"],
    },
    reuseSnapshot: {
      attempted: true,
      rolesReused: ["back"],
      rolesUnresolved: [],
      reasons: ["Back role recovered from SKU verified truth."],
    },
    expansionSnapshot: {
      attempted: false,
      decision: "not_needed",
      rolesCreated: [],
      rolesFailed: [],
      reasons: ["Verified truth already satisfied missing role."],
    },
  }));
  assert.equal(readyAfterSkuTruth.status, "ready");

  const noHiddenGenerateWhenIncomplete = buildOrchestrationPlan(baseInput({
    planner: {
      ...baseInput().planner,
      decision: "block",
      missingRoles: ["back"],
      criticalMissingRoles: ["back"],
      reasons: ["Back view is required for this motion."],
      requiredRoles: ["front", "fit_anchor", "back"],
    },
    compileSnapshot: {
      compiledAnchorPackId: "pack-compiled",
      compiledAt: "2026-03-24T00:00:00.000Z",
    },
  }));
  assert.equal(noHiddenGenerateWhenIncomplete.compileReady, false);
  assert.equal(noHiddenGenerateWhenIncomplete.generateReady, false);
})();
