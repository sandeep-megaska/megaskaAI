import { NextRequest, NextResponse } from "next/server";
import { runAssistedExecution } from "@/lib/video/v2/assistedExecution/assistedExecution";
import type { AssistedExecutionAction, AssistedExecutionRunnableStep } from "@/lib/video/v2/assistedExecution/types";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function isRunnableStep(input: unknown): input is AssistedExecutionRunnableStep {
  return input === "search_existing_truth"
    || input === "expand_missing_anchors"
    || input === "recheck_fidelity"
    || input === "compile"
    || input === "generate";
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const clipIntentId = id?.trim();
    if (!clipIntentId) return json(400, { success: false, error: "clip intent id is required." });

    const body = (await request.json().catch(() => ({}))) as {
      action?: AssistedExecutionAction;
      step_type?: unknown;
      snapshots?: {
        reuse_snapshot?: { attempted?: boolean; rolesReused?: string[]; rolesUnresolved?: string[]; reasons?: string[] };
        expansion_snapshot?: {
          attempted?: boolean;
          decision?: "expanded" | "partial" | "blocked" | "not_needed";
          rolesCreated?: string[];
          rolesFailed?: string[];
          reasons?: string[];
        };
      };
    };

    const action = body.action ?? (body.step_type ? "run_step" : "run_recommended_step");

    if (action !== "run_recommended_step" && action !== "run_step" && action !== "refresh_orchestration") {
      return json(400, { success: false, error: "Unsupported assisted execution action." });
    }

    if (action === "run_step" && !isRunnableStep(body.step_type)) {
      return json(400, { success: false, error: "step_type is required and must be a safe runnable step." });
    }

    const result = await runAssistedExecution({
      clipIntentId,
      action,
      explicitStepType: action === "run_step" ? (body.step_type as AssistedExecutionRunnableStep) : undefined,
      snapshots: {
        reuseSnapshot: body.snapshots?.reuse_snapshot
          ? {
            attempted: Boolean(body.snapshots.reuse_snapshot.attempted),
            rolesReused: body.snapshots.reuse_snapshot.rolesReused ?? [],
            rolesUnresolved: body.snapshots.reuse_snapshot.rolesUnresolved ?? [],
            reasons: body.snapshots.reuse_snapshot.reasons ?? [],
          }
          : null,
        expansionSnapshot: body.snapshots?.expansion_snapshot
          ? {
            attempted: Boolean(body.snapshots.expansion_snapshot.attempted),
            decision: body.snapshots.expansion_snapshot.decision ?? "not_needed",
            rolesCreated: body.snapshots.expansion_snapshot.rolesCreated ?? [],
            rolesFailed: body.snapshots.expansion_snapshot.rolesFailed ?? [],
            reasons: body.snapshots.expansion_snapshot.reasons ?? [],
          }
          : null,
      },
    });

    return json(200, { success: true, data: result });
  } catch (error) {
    return json(400, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
