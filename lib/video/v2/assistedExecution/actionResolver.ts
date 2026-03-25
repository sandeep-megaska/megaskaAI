import type { OrchestrationPlan } from "@/lib/video/v2/orchestration/types";
import type { AssistedExecutionRunnableStep } from "@/lib/video/v2/assistedExecution/types";

const RUNNABLE_STEPS: AssistedExecutionRunnableStep[] = [
  "search_existing_truth",
  "expand_missing_anchors",
  "recheck_fidelity",
  "compile",
  "generate",
];

function isRunnableStep(stepType: string): stepType is AssistedExecutionRunnableStep {
  return RUNNABLE_STEPS.includes(stepType as AssistedExecutionRunnableStep);
}

export function resolveRecommendedStep(plan: OrchestrationPlan): AssistedExecutionRunnableStep | null {
  const recommendedReady = plan.steps.find((step) => step.recommended && step.status === "ready" && isRunnableStep(step.type));
  if (recommendedReady && isRunnableStep(recommendedReady.type)) return recommendedReady.type;

  if (plan.compileReady) return "compile";
  if (plan.generateReady) return "generate";

  return null;
}

export function resolveStepOrBlock(plan: OrchestrationPlan, explicitStep?: AssistedExecutionRunnableStep) {
  const stepType = explicitStep ?? resolveRecommendedStep(plan);

  if (!stepType) {
    return {
      stepType: null,
      blockedReason: "No safe runnable next step is currently available.",
    };
  }

  if (stepType === "compile" && !plan.compileReady) {
    return {
      stepType,
      blockedReason: "Compile is not allowed because required truth is incomplete or compile gates are blocked.",
    };
  }

  if (stepType === "generate" && !plan.generateReady) {
    return {
      stepType,
      blockedReason: "Generate is not allowed until compile is complete and readiness gates pass.",
    };
  }

  const matchingStep = plan.steps.find((step) => step.type === stepType);
  if (matchingStep && (matchingStep.status === "blocked" || matchingStep.status === "failed")) {
    return {
      stepType,
      blockedReason: matchingStep.reason ?? "Selected step is currently blocked by planner/orchestration safeguards.",
    };
  }

  return {
    stepType,
    blockedReason: null,
  };
}
