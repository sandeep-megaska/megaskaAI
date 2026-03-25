import { evaluateExpansionEligibility } from "@/lib/video/v2/anchorExpansion/eligibility";
import { generateExpandedAnchor } from "@/lib/video/v2/anchorExpansion/generator";
import { persistExpandedAnchor } from "@/lib/video/v2/anchorExpansion/persistence";
import { buildExpansionPrompt } from "@/lib/video/v2/anchorExpansion/promptBuilder";
import type { AnchorExpansionContext, AnchorExpansionResult, ExpansionRoleResult } from "@/lib/video/v2/anchorExpansion/types";

function resolveRequestedRoles(context: AnchorExpansionContext, requestedRoles?: string[]) {
  const roles = requestedRoles?.length ? requestedRoles : context.planner.missingRoles;
  return [...new Set(roles)];
}

type ExpansionDeps = {
  evaluate: typeof evaluateExpansionEligibility;
  buildPrompt: typeof buildExpansionPrompt;
  generate: typeof generateExpandedAnchor;
  persist: typeof persistExpandedAnchor;
};

async function executeWithDeps(context: AnchorExpansionContext, requestedRoles?: string[], deps?: Partial<ExpansionDeps>) {
  const d: ExpansionDeps = {
    evaluate: deps?.evaluate ?? evaluateExpansionEligibility,
    buildPrompt: deps?.buildPrompt ?? buildExpansionPrompt,
    generate: deps?.generate ?? generateExpandedAnchor,
    persist: deps?.persist ?? persistExpandedAnchor,
  };

  const rolesRequested = resolveRequestedRoles(context, requestedRoles);
  if (!rolesRequested.length) {
    return {
      decision: "not_needed",
      roles_requested: [],
      roles_attempted: [],
      roles_created: [],
      roles_failed: [],
      results: [],
      reasons: ["Planner reports no missing anchor roles."],
      recommendations: ["Proceed to compile/generate."],
    } satisfies AnchorExpansionResult;
  }

  const roleQueue: string[] = [];
  const results: ExpansionRoleResult[] = [];

  for (const role of rolesRequested) {
    if (role === "three_quarter_side") {
      roleQueue.push("three_quarter_left", "three_quarter_right");
      continue;
    }
    roleQueue.push(role);
  }

  for (const role of roleQueue) {
    const eligibility = d.evaluate(context, role);
    if (!eligibility.eligible_for_expansion) {
      results.push({
        role,
        eligible: false,
        attempted: false,
        success: false,
        provenance: null,
        confidence: eligibility.confidence_level,
        reason: `${eligibility.eligibility_reason}${eligibility.blockers.length ? ` Blockers: ${eligibility.blockers.join("; ")}` : ""}`,
      });
      continue;
    }

    const prompt = d.buildPrompt(context, role);

    try {
      const generated = await d.generate({ context, role, prompt });
      const persisted = await d.persist({
        context,
        role,
        prompt,
        generated,
        eligibilityReason: eligibility.eligibility_reason,
      });

      results.push({
        role,
        eligible: true,
        attempted: true,
        success: true,
        provenance: "expanded_generated",
        confidence: eligibility.confidence_level,
        reason: "Anchor expanded and attached to working pack.",
        generation_id: persisted.generationId,
        asset_id: persisted.assetId,
      });
    } catch (error) {
      results.push({
        role,
        eligible: true,
        attempted: true,
        success: false,
        provenance: null,
        confidence: eligibility.confidence_level,
        reason: error instanceof Error ? error.message : "Expansion attempt failed.",
      });
    }
  }

  const rolesAttempted = results.filter((result) => result.attempted).map((result) => result.role);
  const rolesCreated = results.filter((result) => result.success).map((result) => result.role);
  const rolesFailed = results.filter((result) => result.attempted && !result.success).map((result) => result.role);
  const hasIneligible = results.some((result) => !result.eligible);

  const decision = !rolesAttempted.length
    ? "blocked"
    : rolesCreated.length === rolesAttempted.length && !hasIneligible
      ? "expanded"
      : rolesCreated.length > 0
        ? "partial"
        : "blocked";

  const reasons = decision === "expanded"
    ? ["Missing anchors were expanded and persisted."]
    : decision === "partial"
      ? ["Some missing anchors were expanded while others were blocked or failed."]
      : ["Anchor expansion could not safely satisfy requested missing roles."];

  const recommendations: string[] = [];
  if (decision === "expanded" || decision === "partial") recommendations.push("Re-run fidelity plan and compile after reviewing expanded anchors.");
  if (decision === "blocked") recommendations.push("Capture additional real references for blocked roles and retry expansion.");

  return {
    decision,
    roles_requested: rolesRequested,
    roles_attempted: rolesAttempted,
    roles_created: rolesCreated,
    roles_failed: rolesFailed,
    results,
    reasons,
    recommendations,
  } satisfies AnchorExpansionResult;
}

export async function expandMissingAnchors(context: AnchorExpansionContext, requestedRoles?: string[]) {
  return executeWithDeps(context, requestedRoles);
}

export async function expandMissingAnchorsForTest(
  context: AnchorExpansionContext,
  requestedRoles: string[] | undefined,
  deps: Partial<ExpansionDeps>,
) {
  return executeWithDeps(context, requestedRoles, deps);
}
