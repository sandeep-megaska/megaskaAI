import { buildOrchestrationPlan } from "@/lib/video/v2/orchestration/sequencing";
import type { BuildOrchestrationInput, ExpansionSnapshot, OrchestrationPlan, ReuseSnapshot } from "@/lib/video/v2/orchestration/types";

function normalizeList(input: unknown): string[] {
  return Array.isArray(input) ? input.filter((value): value is string => typeof value === "string") : [];
}

export function normalizeReuseSnapshot(input: unknown): ReuseSnapshot | null {
  if (!input || typeof input !== "object") return null;
  const data = input as Record<string, unknown>;
  return {
    attempted: Boolean(data.attempted),
    rolesReused: normalizeList(data.rolesReused),
    rolesUnresolved: normalizeList(data.rolesUnresolved),
    reasons: normalizeList(data.reasons),
  };
}

export function normalizeExpansionSnapshot(input: unknown): ExpansionSnapshot | null {
  if (!input || typeof input !== "object") return null;
  const data = input as Record<string, unknown>;
  const decision = data.decision;
  if (decision !== "expanded" && decision !== "partial" && decision !== "blocked" && decision !== "not_needed") return null;

  return {
    attempted: Boolean(data.attempted),
    decision,
    rolesCreated: normalizeList(data.rolesCreated),
    rolesFailed: normalizeList(data.rolesFailed),
    reasons: normalizeList(data.reasons),
  };
}

export function orchestrateClipIntent(input: BuildOrchestrationInput): OrchestrationPlan {
  return buildOrchestrationPlan(input);
}
