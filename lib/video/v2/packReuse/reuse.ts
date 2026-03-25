import { findReuseCandidates } from "@/lib/video/v2/packReuse/candidateSearch";
import { chooseRoleReuseDecision } from "@/lib/video/v2/packReuse/decision";
import { persistReusedAnchor } from "@/lib/video/v2/packReuse/persistence";
import { scoreReuseCandidate } from "@/lib/video/v2/packReuse/scoring";
import type { PackReuseContext, PackReuseResult, ReuseExecutionDeps } from "@/lib/video/v2/packReuse/types";

function resolveRoles(context: PackReuseContext, requestedRoles?: string[]) {
  const missingSet = new Set(context.planner.missingRoles);
  const roles = requestedRoles?.length ? requestedRoles : context.planner.missingRoles;
  return [...new Set(roles)].filter((role) => missingSet.has(role));
}

async function executeWithDeps(context: PackReuseContext, requestedRoles?: string[], deps?: Partial<ReuseExecutionDeps>): Promise<PackReuseResult> {
  const d: ReuseExecutionDeps = {
    findCandidates: deps?.findCandidates ?? findReuseCandidates,
    persistReuse: deps?.persistReuse ?? persistReusedAnchor,
    listExistingItems: deps?.listExistingItems ?? ((ctx) => ctx.items),
  };

  const rolesRequested = resolveRoles(context, requestedRoles);
  if (!rolesRequested.length) {
    return {
      roles_requested: [],
      roles_reused: [],
      roles_unresolved: [],
      decisions: [],
      reasons: ["No missing planner roles require reuse."],
      recommendations: ["Proceed to compile/generate."],
    };
  }

  const existingRoles = new Set(d.listExistingItems(context).filter((item) => item.generation_id).map((item) => item.role));
  const rolesToEvaluate = rolesRequested.filter((role) => !existingRoles.has(role));

  if (!rolesToEvaluate.length) {
    return {
      roles_requested: rolesRequested,
      roles_reused: [],
      roles_unresolved: [],
      decisions: rolesRequested.map((role) => ({ role, candidates: [], chosen_candidate: null, decision: "skip", reason: "Role already satisfied in working pack." })),
      reasons: ["All requested roles are already satisfied in the current working pack."],
      recommendations: ["Proceed to compile/generate."],
    };
  }

  const rolesReused: string[] = [];
  const rolesUnresolved: string[] = [];
  const decisions = [];

  for (const role of rolesToEvaluate) {
    const candidates = await d.findCandidates(context, role);
    const critical = context.planner.criticalMissingRoles.includes(role);

    const scored = candidates.map((candidate, index) =>
      scoreReuseCandidate({
        context,
        role,
        candidate,
        critical,
        recencyRank: index,
      }),
    );

    const decision = chooseRoleReuseDecision({ role, candidates: scored, critical });

    if (decision.decision === "reuse" && decision.chosen_candidate) {
      await d.persistReuse({ context, role, candidate: decision.chosen_candidate });
      rolesReused.push(role);
    } else {
      rolesUnresolved.push(role);
    }

    decisions.push(decision);
  }

  const reasons = rolesReused.length
    ? rolesUnresolved.length
      ? ["Some missing roles were satisfied using deterministic truth reuse; others remain unresolved."]
      : ["All requested missing roles were satisfied using deterministic truth reuse."]
    : ["No eligible reusable truth was found for requested missing roles."];

  const recommendations: string[] = [];
  if (rolesUnresolved.length) recommendations.push("Use Slice E anchor expansion for unresolved roles.");
  if (rolesReused.length) recommendations.push("Re-run fidelity plan and compile after reviewing reused anchors.");

  return {
    roles_requested: rolesRequested,
    roles_reused: rolesReused,
    roles_unresolved: rolesUnresolved,
    decisions,
    reasons,
    recommendations,
  };
}

export async function reusePackAnchors(context: PackReuseContext, requestedRoles?: string[]) {
  return executeWithDeps(context, requestedRoles);
}

export async function reusePackAnchorsForTest(context: PackReuseContext, requestedRoles: string[] | undefined, deps: Partial<ReuseExecutionDeps>) {
  return executeWithDeps(context, requestedRoles, deps);
}
