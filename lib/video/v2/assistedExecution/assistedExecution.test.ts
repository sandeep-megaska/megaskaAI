import assert from "node:assert/strict";
import { runAssistedExecution } from "@/lib/video/v2/assistedExecution/assistedExecution";
import type { OrchestrationPlan } from "@/lib/video/v2/orchestration/types";

function plan(overrides?: Partial<OrchestrationPlan>): OrchestrationPlan {
  return {
    status: "needs_reuse",
    summary: "Missing truth detected. Search existing truth first.",
    reasons: [],
    recommendations: ["Search existing truth first."],
    steps: [
      { id: "planner_review", type: "planner_review", label: "Planner review", status: "completed", recommended: false, autoRunnable: true, reason: null, details: null },
      { id: "search_existing_truth", type: "search_existing_truth", label: "Search existing truth", status: "ready", recommended: true, autoRunnable: true, reason: null, details: null },
      { id: "expand_missing_anchors", type: "expand_missing_anchors", label: "Generate missing anchors", status: "pending", recommended: false, autoRunnable: false, reason: null, details: null },
      { id: "recheck_fidelity", type: "recheck_fidelity", label: "Recheck fidelity", status: "pending", recommended: false, autoRunnable: true, reason: null, details: null },
      { id: "ready_to_compile", type: "ready_to_compile", label: "Ready to compile", status: "blocked", recommended: false, autoRunnable: false, reason: null, details: null },
      { id: "compile", type: "compile", label: "Compile", status: "blocked", recommended: false, autoRunnable: false, reason: null, details: null },
      { id: "generate", type: "generate", label: "Generate", status: "pending", recommended: false, autoRunnable: false, reason: null, details: null },
    ],
    plannerSnapshot: {
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
    reuseSnapshot: null,
    expansionSnapshot: null,
    compileReady: false,
    generateReady: false,
    ...overrides,
  };
}

void (async () => {
  let callCount = 0;
  const refreshReuseThenExpansion = async () => {
    callCount += 1;
    if (callCount === 1) return plan();
    return plan({
      status: "needs_expansion",
      summary: "No reusable truth found. Generate missing anchors next.",
      recommendations: ["Generate missing anchors next."],
      steps: plan().steps.map((s) => {
        if (s.type === "search_existing_truth") return { ...s, status: "completed", recommended: false };
        if (s.type === "expand_missing_anchors") return { ...s, status: "ready", recommended: true };
        return s;
      }),
      reuseSnapshot: { attempted: true, rolesReused: [], rolesUnresolved: ["back"], reasons: ["No reusable truth found."] },
    });
  };

  const recommendedReuse = await runAssistedExecution({
    clipIntentId: "clip-1",
    action: "run_recommended_step",
    refresh: refreshReuseThenExpansion,
    runnerDeps: {
      buildReuseContext: async () => ({}) as never,
      buildExpansionContext: async () => ({}) as never,
      reuse: async () => ({ roles_requested: ["back"], roles_reused: [], roles_unresolved: ["back"], decisions: [], reasons: ["No reusable truth found."], recommendations: [] }),
      expand: async () => ({ decision: "blocked", roles_requested: [], roles_attempted: [], roles_created: [], roles_failed: [], results: [], reasons: [], recommendations: [] }),
      compile: async () => ({ clipIntentId: "clip-1", workingPackId: "pack-1", sourceProfileId: "source-1", compiledAnchorPackId: "compiled-1", warnings: [], runRequest: {} as never }),
      generate: async () => ({ run_id: "run-1", clip_intent_id: "clip-1", compiled_anchor_pack_id: "compiled-1", status: "queued" }),
    },
  });
  assert.equal(recommendedReuse.initial_step_type, "search_existing_truth");
  assert.equal(recommendedReuse.executed_steps[0]?.status, "completed");
  assert.equal(recommendedReuse.orchestration_plan.steps.find((s) => s.type === "expand_missing_anchors")?.recommended, true);

  const chooseExpansion = await runAssistedExecution({
    clipIntentId: "clip-1",
    action: "run_recommended_step",
    refresh: async () => plan({
      status: "needs_expansion",
      steps: plan().steps.map((s) => {
        if (s.type === "search_existing_truth") return { ...s, status: "completed", recommended: false };
        if (s.type === "expand_missing_anchors") return { ...s, status: "ready", recommended: true };
        return s;
      }),
      reuseSnapshot: { attempted: true, rolesReused: [], rolesUnresolved: ["back"], reasons: ["No reusable truth found."] },
    }),
    runnerDeps: {
      buildReuseContext: async () => ({}) as never,
      buildExpansionContext: async () => ({}) as never,
      reuse: async () => ({ roles_requested: [], roles_reused: [], roles_unresolved: [], decisions: [], reasons: [], recommendations: [] }),
      expand: async () => ({ decision: "expanded", roles_requested: ["back"], roles_attempted: ["back"], roles_created: ["back"], roles_failed: [], results: [], reasons: ["expanded"], recommendations: [] }),
      compile: async () => ({ clipIntentId: "clip-1", workingPackId: "pack-1", sourceProfileId: "source-1", compiledAnchorPackId: "compiled-1", warnings: [], runRequest: {} as never }),
      generate: async () => ({ run_id: "run-1", clip_intent_id: "clip-1", compiled_anchor_pack_id: "compiled-1", status: "queued" }),
    },
  });
  assert.equal(chooseExpansion.initial_step_type, "expand_missing_anchors");

  const refuseUnsafeCompile = await runAssistedExecution({
    clipIntentId: "clip-1",
    action: "run_step",
    explicitStepType: "compile",
    refresh: async () => plan({ compileReady: false }),
  });
  assert.equal(refuseUnsafeCompile.executed_steps[0]?.status, "blocked");

  const recheckWorks = await runAssistedExecution({
    clipIntentId: "clip-1",
    action: "run_step",
    explicitStepType: "recheck_fidelity",
    refresh: async () => plan({
      status: "ready",
      summary: "Truth complete.",
      recommendations: ["Ready to compile."],
      compileReady: true,
    }),
  });
  assert.equal(recheckWorks.executed_steps[0]?.success, true);

  const blockedPlanNoStep = await runAssistedExecution({
    clipIntentId: "clip-1",
    action: "run_recommended_step",
    refresh: async () => plan({
      status: "blocked",
      summary: "Blocked",
      steps: plan().steps.map((s) => ({ ...s, recommended: false, status: s.type === "planner_review" ? "completed" : "blocked" })),
    }),
  });
  assert.equal(blockedPlanNoStep.executed_steps.length, 0);

  let refreshCount = 0;
  await runAssistedExecution({
    clipIntentId: "clip-1",
    action: "run_step",
    explicitStepType: "search_existing_truth",
    refresh: async () => {
      refreshCount += 1;
      return plan();
    },
    runnerDeps: {
      buildReuseContext: async () => ({}) as never,
      buildExpansionContext: async () => ({}) as never,
      reuse: async () => ({ roles_requested: ["back"], roles_reused: ["back"], roles_unresolved: [], decisions: [], reasons: ["ok"], recommendations: [] }),
      expand: async () => ({ decision: "blocked", roles_requested: [], roles_attempted: [], roles_created: [], roles_failed: [], results: [], reasons: [], recommendations: [] }),
      compile: async () => ({ clipIntentId: "clip-1", workingPackId: "pack-1", sourceProfileId: "source-1", compiledAnchorPackId: "compiled-1", warnings: [], runRequest: {} as never }),
      generate: async () => ({ run_id: "run-1", clip_intent_id: "clip-1", compiled_anchor_pack_id: "compiled-1", status: "queued" }),
    },
  });
  assert.equal(refreshCount, 2);

  const compileDoesNotAutoGenerate = await runAssistedExecution({
    clipIntentId: "clip-1",
    action: "run_step",
    explicitStepType: "compile",
    refresh: async () => plan({
      status: "ready",
      compileReady: true,
      generateReady: false,
      steps: plan().steps.map((s) => {
        if (s.type === "compile") return { ...s, status: "ready", recommended: true };
        return s;
      }),
    }),
    runnerDeps: {
      buildReuseContext: async () => ({}) as never,
      buildExpansionContext: async () => ({}) as never,
      reuse: async () => ({ roles_requested: [], roles_reused: [], roles_unresolved: [], decisions: [], reasons: [], recommendations: [] }),
      expand: async () => ({ decision: "blocked", roles_requested: [], roles_attempted: [], roles_created: [], roles_failed: [], results: [], reasons: [], recommendations: [] }),
      compile: async () => ({ clipIntentId: "clip-1", workingPackId: "pack-1", sourceProfileId: "source-1", compiledAnchorPackId: "compiled-1", warnings: [], runRequest: {} as never }),
      generate: async () => {
        throw new Error("should not run generate");
      },
    },
  });
  assert.equal(compileDoesNotAutoGenerate.executed_steps[0]?.step_type, "compile");

  const explicitUnsafeStepRejected = await runAssistedExecution({
    clipIntentId: "clip-1",
    action: "run_step",
    explicitStepType: "generate",
    refresh: async () => plan({ generateReady: false }),
  });
  assert.equal(explicitUnsafeStepRejected.executed_steps[0]?.status, "blocked");
})();
