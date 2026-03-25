import { resolveStepOrBlock } from "@/lib/video/v2/assistedExecution/actionResolver";
import { refreshOrchestrationPlan } from "@/lib/video/v2/assistedExecution/refresh";
import { runAssistedStep, type AssistedRunnerDeps } from "@/lib/video/v2/assistedExecution/runner";
import type {
  AssistedExecutionAction,
  AssistedExecutionResult,
  AssistedExecutionRunnableStep,
  AssistedExecutionStepResult,
  OrchestrationSnapshots,
} from "@/lib/video/v2/assistedExecution/types";

function blockedStep(stepType: AssistedExecutionRunnableStep, reason: string): AssistedExecutionStepResult {
  return {
    step_type: stepType,
    attempted: false,
    success: false,
    status: "blocked",
    reason,
  };
}

export async function runAssistedExecution(input: {
  clipIntentId: string;
  action: AssistedExecutionAction;
  explicitStepType?: AssistedExecutionRunnableStep;
  snapshots?: OrchestrationSnapshots;
  runnerDeps?: AssistedRunnerDeps;
  refresh?: typeof refreshOrchestrationPlan;
}): Promise<AssistedExecutionResult> {
  const refresh = input.refresh ?? refreshOrchestrationPlan;
  const snapshots = input.snapshots ?? {};

  const initialPlan = await refresh(input.clipIntentId, snapshots);

  if (input.action === "refresh_orchestration") {
    return {
      action: input.action,
      initial_step_type: null,
      executed_steps: [],
      orchestration_plan: initialPlan,
      summary: initialPlan.summary,
      recommendations: initialPlan.recommendations,
    };
  }

  const resolved = resolveStepOrBlock(initialPlan, input.explicitStepType);
  if (!resolved.stepType) {
    return {
      action: input.action,
      initial_step_type: null,
      executed_steps: [],
      orchestration_plan: initialPlan,
      summary: initialPlan.summary,
      recommendations: [resolved.blockedReason ?? "No safe runnable next step is currently available."],
    };
  }

  if (resolved.blockedReason) {
    const refreshed = await refresh(input.clipIntentId, snapshots);
    return {
      action: input.action,
      initial_step_type: resolved.stepType,
      executed_steps: [blockedStep(resolved.stepType, resolved.blockedReason)],
      orchestration_plan: refreshed,
      summary: refreshed.summary,
      recommendations: refreshed.recommendations,
    };
  }

  const executed = await runAssistedStep(input.clipIntentId, resolved.stepType, initialPlan, snapshots, input.runnerDeps);
  const refreshed = await refresh(input.clipIntentId, executed.snapshots);

  return {
    action: input.action,
    initial_step_type: resolved.stepType,
    executed_steps: [executed.step],
    orchestration_plan: refreshed,
    summary: refreshed.summary,
    recommendations: refreshed.recommendations,
  };
}
