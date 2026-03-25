import type { AnchorExpansionResult } from "@/lib/video/v2/anchorExpansion/types";
import type { OrchestrationPlan, OrchestrationStepType } from "@/lib/video/v2/orchestration/types";
import type { PackReuseResult } from "@/lib/video/v2/packReuse/types";

export type AssistedExecutionAction = "run_recommended_step" | "run_step" | "refresh_orchestration";

export type AssistedExecutionRunnableStep = Extract<
  OrchestrationStepType,
  "search_existing_truth" | "expand_missing_anchors" | "recheck_fidelity" | "compile" | "generate"
>;

export type AssistedExecutionStepStatus = "completed" | "failed" | "blocked" | "skipped";

export type AssistedExecutionStepResult = {
  step_type: AssistedExecutionRunnableStep;
  attempted: boolean;
  success: boolean;
  status: AssistedExecutionStepStatus;
  reason?: string | null;
  details?: Record<string, unknown> | null;
};

export type AssistedExecutionResult = {
  action: AssistedExecutionAction;
  initial_step_type?: AssistedExecutionRunnableStep | null;
  executed_steps: AssistedExecutionStepResult[];
  orchestration_plan: OrchestrationPlan;
  summary: string;
  recommendations: string[];
};

export type OrchestrationSnapshots = {
  reuseSnapshot?: {
    attempted: boolean;
    rolesReused: string[];
    rolesUnresolved: string[];
    reasons: string[];
  } | null;
  expansionSnapshot?: {
    attempted: boolean;
    decision: "expanded" | "partial" | "blocked" | "not_needed";
    rolesCreated: string[];
    rolesFailed: string[];
    reasons: string[];
  } | null;
};

export function toReuseSnapshot(result: PackReuseResult): NonNullable<OrchestrationSnapshots["reuseSnapshot"]> {
  return {
    attempted: true,
    rolesReused: result.roles_reused,
    rolesUnresolved: result.roles_unresolved,
    reasons: result.reasons,
  };
}

export function toExpansionSnapshot(result: AnchorExpansionResult): NonNullable<OrchestrationSnapshots["expansionSnapshot"]> {
  return {
    attempted: true,
    decision: result.decision,
    rolesCreated: result.roles_created,
    rolesFailed: result.roles_failed,
    reasons: result.reasons,
  };
}
