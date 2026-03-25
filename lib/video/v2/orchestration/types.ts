import type { CreativeFidelityPlan } from "@/lib/video/v2/creativeFidelity/types";

export type OrchestrationStatus =
  | "ready"
  | "needs_reuse"
  | "needs_expansion"
  | "needs_partial_expansion"
  | "blocked"
  | "in_progress"
  | "failed";

export type OrchestrationStepType =
  | "planner_review"
  | "search_existing_truth"
  | "expand_missing_anchors"
  | "recheck_fidelity"
  | "ready_to_compile"
  | "compile"
  | "generate";

export type OrchestrationStepState = "pending" | "ready" | "running" | "completed" | "blocked" | "failed" | "skipped";

export type OrchestrationStep = {
  id: string;
  type: OrchestrationStepType;
  label: string;
  status: OrchestrationStepState;
  reason?: string | null;
  recommended: boolean;
  autoRunnable: boolean;
  details?: Record<string, unknown> | null;
};

export type ReuseSnapshot = {
  attempted: boolean;
  rolesReused: string[];
  rolesUnresolved: string[];
  reasons: string[];
};

export type ExpansionSnapshot = {
  attempted: boolean;
  decision: "expanded" | "partial" | "blocked" | "not_needed";
  rolesCreated: string[];
  rolesFailed: string[];
  reasons: string[];
};

export type WorkingPackSnapshot = {
  id: string;
  status: string;
  readinessScore: number;
  roles: string[];
};

export type ClipIntentCompileSnapshot = {
  compiledAnchorPackId: string | null;
  compiledAt: string | null;
};

export type OrchestrationPlan = {
  status: OrchestrationStatus;
  summary: string;
  reasons: string[];
  recommendations: string[];
  steps: OrchestrationStep[];
  plannerSnapshot: CreativeFidelityPlan;
  reuseSnapshot: ReuseSnapshot | null;
  expansionSnapshot: ExpansionSnapshot | null;
  compileReady: boolean;
  generateReady: boolean;
};

export type BuildOrchestrationInput = {
  planner: CreativeFidelityPlan;
  workingPack: WorkingPackSnapshot;
  compileSnapshot: ClipIntentCompileSnapshot;
  reuseSnapshot?: ReuseSnapshot | null;
  expansionSnapshot?: ExpansionSnapshot | null;
};
