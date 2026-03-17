import {
  ConstraintProfile,
  FidelityLevel,
  PreferredOutputStyle,
  WorkflowMode,
  WorkflowProfile,
} from "@/lib/tryon/types";

function normalizeWorkflowMode(value: unknown): WorkflowMode {
  return value === "catalog_fidelity" ? "catalog_fidelity" : "standard_tryon";
}

function normalizeFidelityLevel(value: unknown, workflowMode: WorkflowMode): FidelityLevel {
  if (value === "balanced" || value === "strict" || value === "hard_lock") return value;
  return workflowMode === "catalog_fidelity" ? "strict" : "balanced";
}

function normalizeStyle(value: unknown, workflowMode: WorkflowMode): PreferredOutputStyle {
  if (value === "catalog" || value === "studio" || value === "lifestyle") return value;
  return workflowMode === "catalog_fidelity" ? "catalog" : "studio";
}

export function buildWorkflowProfile(input: {
  workflowMode?: unknown;
  fidelityLevel?: unknown;
  preferredOutputStyle?: unknown;
  constraintProfile?: ConstraintProfile;
  prompt?: string | null;
}): WorkflowProfile {
  const workflowMode = normalizeWorkflowMode(input.workflowMode);
  const fidelityLevel = normalizeFidelityLevel(input.fidelityLevel, workflowMode);
  const preferredOutputStyle = normalizeStyle(input.preferredOutputStyle, workflowMode);

  const catalogLocked = workflowMode === "catalog_fidelity";
  const hardLock = fidelityLevel === "hard_lock";
  const strict = fidelityLevel === "strict" || hardLock;

  const shouldAllowPoseVariation = !catalogLocked && (input.constraintProfile?.allowPoseChange ?? true);
  const shouldAllowBackgroundVariation = !catalogLocked && (input.constraintProfile?.allowBackgroundChange ?? true);

  return {
    workflowMode,
    fidelityLevel,
    preferredOutputStyle,
    creativeFreedom: hardLock || catalogLocked ? "low" : "medium",
    shouldUseCatalogRules: catalogLocked,
    shouldAllowSceneStyling: catalogLocked ? preferredOutputStyle === "lifestyle" && !hardLock : true,
    shouldAllowPoseVariation: strict ? false : shouldAllowPoseVariation,
    shouldAllowBackgroundVariation: strict ? false : shouldAllowBackgroundVariation,
  };
}
