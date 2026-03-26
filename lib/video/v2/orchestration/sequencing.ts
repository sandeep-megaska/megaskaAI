import type {
  BuildOrchestrationInput,
  OrchestrationPlan,
  OrchestrationStatus,
  OrchestrationStep,
  OrchestrationStepState,
  ReuseSnapshot,
} from "@/lib/video/v2/orchestration/types";
import { getCompileBlockingReasons } from "@/lib/video/v2/orchestration/status";

function step(
  type: OrchestrationStep["type"],
  label: string,
  status: OrchestrationStepState,
  recommended: boolean,
  autoRunnable: boolean,
  reason?: string | null,
  details?: Record<string, unknown> | null,
): OrchestrationStep {
  return {
    id: type,
    type,
    label,
    status,
    recommended,
    autoRunnable,
    reason: reason ?? null,
    details: details ?? null,
  };
}

function hasUnresolvedMissingRoles(input: BuildOrchestrationInput): boolean {
  const missingSet = new Set(input.planner.missingRoles);
  if (!missingSet.size) return false;

  const resolvedByReuse = new Set(input.reuseSnapshot?.rolesReused ?? []);
  const resolvedByExpansion = new Set(input.expansionSnapshot?.rolesCreated ?? []);

  for (const role of missingSet) {
    if (!resolvedByReuse.has(role) && !resolvedByExpansion.has(role)) return true;
  }

  return false;
}

function buildReuseReason(snapshot: ReuseSnapshot | null | undefined): string | null {
  if (!snapshot?.attempted) return "Search existing truth first before anchor expansion.";
  if (snapshot.rolesReused.length) {
    return `Reused roles: ${snapshot.rolesReused.join(", ")}.`;
  }
  return "No reusable truth found for current missing roles.";
}

export function buildOrchestrationPlan(input: BuildOrchestrationInput): OrchestrationPlan {
  const missingRoles = input.planner.missingRoles;
  const criticalMissingRoles = input.planner.criticalMissingRoles;
  const compileBlockingReasons = getCompileBlockingReasons(input.workingPack, input.planner, input.transitionPlan, input.governance?.truthDebt);
  const compileReady = compileBlockingReasons.length === 0;
  const generateReady = compileReady && Boolean(input.compileSnapshot.compiledAnchorPackId);

  const steps: OrchestrationStep[] = [];
  const reasons: string[] = [...input.planner.reasons];
  const recommendations: string[] = [];

  if (input.transitionPlan?.strategy === "segmented") {
    recommendations.push("Transition Plan: Segmented. Run adjacent A→B and B→C segments with local anchors.");
  }
  if (input.transitionPlan?.strategy === "blocked_missing_intermediate") {
    recommendations.push(input.transitionPlan.recommendations[0] ?? "Intermediate State Required before compile.");
  }

  steps.push(step("planner_review", "Planner review", "completed", false, true, input.planner.decision));

  if (!missingRoles.length && input.planner.decision !== "block") {
    steps.push(step("search_existing_truth", "Search existing truth", "skipped", false, false, "No missing truth roles."));
    steps.push(step("expand_missing_anchors", "Generate missing anchors", "skipped", false, false, "No missing truth roles."));
    steps.push(step("recheck_fidelity", "Recheck fidelity", "completed", false, true, "Planner already reports full required truth coverage."));
    steps.push(step("ready_to_compile", "Ready to compile", compileReady ? "ready" : "blocked", true, false, compileReady ? "All required truth is satisfied." : compileBlockingReasons[0], { transition_strategy: input.transitionPlan?.strategy ?? "none" }));
    steps.push(step("compile", "Compile", compileReady ? "ready" : "blocked", compileReady, false, compileReady ? "Manual compile is available." : compileBlockingReasons[0]));
    steps.push(step("generate", "Generate", generateReady ? "ready" : "pending", generateReady, false, generateReady ? "Compiled anchor pack exists; generation can be user-triggered." : "Generate remains user-triggered after compile."));

    if (compileReady) {
      recommendations.push("All required truth is now satisfied. Ready to compile.");
      return {
        status: "ready",
        summary: "Truth coverage is complete. You can compile now.",
        reasons,
        recommendations,
        steps,
        plannerSnapshot: input.planner,
        reuseSnapshot: input.reuseSnapshot ?? null,
        expansionSnapshot: input.expansionSnapshot ?? null,
        compileReady,
        generateReady,
      transitionPlan: input.transitionPlan ?? null,
      governance: input.governance ?? null,
      };
    }

    recommendations.push("Truth roles are complete, but compile gates still need attention.");
    recommendations.push(...compileBlockingReasons);
    return {
      status: "in_progress",
      summary: "Truth is complete but compile constraints are still blocking execution.",
      reasons,
      recommendations,
      steps,
      plannerSnapshot: input.planner,
      reuseSnapshot: input.reuseSnapshot ?? null,
      expansionSnapshot: input.expansionSnapshot ?? null,
      compileReady,
      generateReady,
      transitionPlan: input.transitionPlan ?? null,
      governance: input.governance ?? null,
    };
  }

  const unresolvedMissing = hasUnresolvedMissingRoles(input);
  const reuseAttempted = Boolean(input.reuseSnapshot?.attempted);
  const expansionAttempted = Boolean(input.expansionSnapshot?.attempted);
  const needsReuseFirst = !reuseAttempted;

  steps.push(
    step(
      "search_existing_truth",
      "Search existing truth",
      needsReuseFirst ? "ready" : "completed",
      true,
      true,
      buildReuseReason(input.reuseSnapshot),
      {
        missing_roles: missingRoles,
        critical_missing_roles: criticalMissingRoles,
      },
    ),
  );

  const canMoveToExpansion = reuseAttempted && (input.reuseSnapshot?.rolesUnresolved.length ?? 0) > 0;
  const expansionBlocked = expansionAttempted && input.expansionSnapshot?.decision === "blocked";

  let expansionStatus: OrchestrationStepState = "pending";
  if (needsReuseFirst) expansionStatus = "pending";
  else if (expansionBlocked) expansionStatus = "blocked";
  else if (canMoveToExpansion) expansionStatus = "ready";
  else if (input.expansionSnapshot?.decision === "expanded" || input.expansionSnapshot?.decision === "partial" || input.expansionSnapshot?.decision === "not_needed") expansionStatus = "completed";

  steps.push(
    step(
      "expand_missing_anchors",
      "Generate missing anchors",
      expansionStatus,
      canMoveToExpansion,
      false,
      expansionBlocked
        ? (input.expansionSnapshot?.reasons[0] ?? "Expansion is blocked by current eligibility/fidelity rules.")
        : canMoveToExpansion
          ? "No reusable truth found for unresolved roles. Expansion is next."
          : "Expansion is a fallback after reuse.",
      {
        unresolved_roles: input.reuseSnapshot?.rolesUnresolved ?? missingRoles,
      },
    ),
  );

  steps.push(
    step(
      "recheck_fidelity",
      "Recheck fidelity",
      unresolvedMissing ? "pending" : "ready",
      !unresolvedMissing,
      true,
      unresolvedMissing
        ? "Recheck after reuse/expansion resolves all missing roles."
        : "Missing roles appear resolved; refresh fidelity plan before compile.",
    ),
  );

  steps.push(
    step(
      "ready_to_compile",
      "Ready to compile",
      compileReady ? "ready" : "blocked",
      compileReady,
      false,
      compileReady ? "All required truth is now satisfied." : compileBlockingReasons[0] ?? "Compile is blocked.",
    ),
  );

  steps.push(step("compile", "Compile", compileReady ? "ready" : "blocked", compileReady, false, compileReady ? "Manual compile is available." : compileBlockingReasons[0]));
  steps.push(step("generate", "Generate", generateReady ? "ready" : "pending", generateReady, false, generateReady ? "Compiled anchor pack exists; generation can be user-triggered." : "Generate remains user-triggered after compile."));

  let status: OrchestrationStatus = "needs_reuse";
  let summary = "Missing truth detected. Search existing truth first.";

  if (!needsReuseFirst && canMoveToExpansion) {
    status = (input.reuseSnapshot?.rolesReused.length ?? 0) > 0 ? "needs_partial_expansion" : "needs_expansion";
    summary = (input.reuseSnapshot?.rolesReused.length ?? 0) > 0
      ? "Some roles were recovered via reuse. Expand only unresolved roles next."
      : "No reusable truth found. Generate missing anchors next.";
  }

  if (expansionBlocked || (expansionAttempted && unresolvedMissing)) {
    status = "blocked";
    summary = "Truth remains insufficient after recovery attempts.";
  }

  if (!unresolvedMissing && compileReady) {
    status = "ready";
    summary = "Truth recovery complete. Ready to compile.";
  }

  recommendations.push(needsReuseFirst
    ? `${missingRoles[0] ?? "Required"} anchor is still missing. Search existing truth first.`
    : canMoveToExpansion
      ? "No reusable anchor found. Generate missing anchors next."
      : "Recheck fidelity after reviewing recovered anchors.");

  if (status === "blocked") {
    recommendations.push(input.expansionSnapshot?.reasons[0] ?? "Expansion failed because missing truth is not safely inferable from current references.");
  }

  if (status === "ready") recommendations.push("All required truth is now satisfied. Ready to compile.");

  return {
    status,
    summary,
    reasons,
    recommendations,
    steps,
    plannerSnapshot: input.planner,
    reuseSnapshot: input.reuseSnapshot ?? null,
    expansionSnapshot: input.expansionSnapshot ?? null,
    compileReady,
    generateReady,
    transitionPlan: input.transitionPlan ?? null,
    governance: input.governance ?? null,
  };
}
