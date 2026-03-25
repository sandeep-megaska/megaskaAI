import { buildAnchorExpansionContext } from "@/lib/video/v2/anchorExpansion/plannerBridge";
import { expandMissingAnchors } from "@/lib/video/v2/anchorExpansion/expand";
import { compileClipIntent } from "@/lib/video/v2/compileClipIntent";
import { generateClipIntent } from "@/lib/video/v2/generateClipIntent";
import type { OrchestrationPlan } from "@/lib/video/v2/orchestration/types";
import { buildPackReuseContext } from "@/lib/video/v2/packReuse/plannerBridge";
import { reusePackAnchors } from "@/lib/video/v2/packReuse/reuse";
import type {
  AssistedExecutionRunnableStep,
  AssistedExecutionStepResult,
  OrchestrationSnapshots,
} from "@/lib/video/v2/assistedExecution/types";
import { toExpansionSnapshot, toReuseSnapshot } from "@/lib/video/v2/assistedExecution/types";

export type AssistedRunnerDeps = {
  reuse: typeof reusePackAnchors;
  expand: typeof expandMissingAnchors;
  compile: typeof compileClipIntent;
  generate: typeof generateClipIntent;
  buildReuseContext: typeof buildPackReuseContext;
  buildExpansionContext: typeof buildAnchorExpansionContext;
};

const defaultDeps: AssistedRunnerDeps = {
  reuse: reusePackAnchors,
  expand: expandMissingAnchors,
  compile: compileClipIntent,
  generate: generateClipIntent,
  buildReuseContext: buildPackReuseContext,
  buildExpansionContext: buildAnchorExpansionContext,
};

export async function runAssistedStep(
  clipIntentId: string,
  stepType: AssistedExecutionRunnableStep,
  plan: OrchestrationPlan,
  snapshots: OrchestrationSnapshots,
  deps: AssistedRunnerDeps = defaultDeps,
): Promise<{ step: AssistedExecutionStepResult; snapshots: OrchestrationSnapshots }> {
  if (stepType === "compile" && !plan.compileReady) {
    return {
      step: {
        step_type: stepType,
        attempted: false,
        success: false,
        status: "blocked",
        reason: "Compile is not allowed because critical truth is still missing.",
      },
      snapshots,
    };
  }

  if (stepType === "generate" && !plan.generateReady) {
    return {
      step: {
        step_type: stepType,
        attempted: false,
        success: false,
        status: "blocked",
        reason: "Generate is not allowed before compile readiness is satisfied.",
      },
      snapshots,
    };
  }

  try {
    if (stepType === "search_existing_truth") {
      const context = await deps.buildReuseContext(clipIntentId);
      const result = await deps.reuse(context);
      return {
        step: {
          step_type: stepType,
          attempted: true,
          success: true,
          status: "completed",
          reason: result.reasons[0] ?? null,
          details: {
            roles_reused: result.roles_reused,
            roles_unresolved: result.roles_unresolved,
          },
        },
        snapshots: {
          ...snapshots,
          reuseSnapshot: toReuseSnapshot(result),
        },
      };
    }

    if (stepType === "expand_missing_anchors") {
      const context = await deps.buildExpansionContext(clipIntentId);
      const result = await deps.expand(context);
      return {
        step: {
          step_type: stepType,
          attempted: true,
          success: result.decision !== "blocked",
          status: result.decision === "blocked" ? "failed" : "completed",
          reason: result.reasons[0] ?? null,
          details: {
            decision: result.decision,
            roles_created: result.roles_created,
            roles_failed: result.roles_failed,
          },
        },
        snapshots: {
          ...snapshots,
          expansionSnapshot: toExpansionSnapshot(result),
        },
      };
    }

    if (stepType === "recheck_fidelity") {
      return {
        step: {
          step_type: stepType,
          attempted: true,
          success: true,
          status: "completed",
          reason: "Fidelity and readiness were rechecked via orchestration refresh.",
        },
        snapshots,
      };
    }

    if (stepType === "compile") {
      const result = await deps.compile({ clipIntentId });
      return {
        step: {
          step_type: stepType,
          attempted: true,
          success: true,
          status: "completed",
          reason: "Compile completed successfully.",
          details: {
            compiled_anchor_pack_id: result.compiledAnchorPackId,
            warnings: result.warnings,
          },
        },
        snapshots,
      };
    }

    const generated = await deps.generate({ clipIntentId });
    return {
      step: {
        step_type: stepType,
        attempted: true,
        success: true,
        status: "completed",
        reason: "Generation started successfully.",
        details: {
          run_id: generated.run_id,
          status: generated.status,
        },
      },
      snapshots,
    };
  } catch (error) {
    return {
      step: {
        step_type: stepType,
        attempted: true,
        success: false,
        status: "failed",
        reason: error instanceof Error ? error.message : "Step execution failed.",
      },
      snapshots,
    };
  }
}
