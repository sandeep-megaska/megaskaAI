import type { CreativeFidelityItem, RoleCoverage, RoleRequirements, FidelityTier, ParsedIntentSignals } from "@/lib/video/v2/creativeFidelity/types";

const SIDE_ROLES = ["three_quarter_left", "three_quarter_right"] as const;

export function inferRoleCoverage(items: CreativeFidelityItem[]): RoleCoverage {
  const availableRoles = new Set<string>();
  const realRoles = new Set<string>();
  const synthesizedRoles = new Set<string>();

  for (const item of items) {
    if (!item.generation_id) continue;
    availableRoles.add(item.role);
    if (item.source_kind === "synthesized") synthesizedRoles.add(item.role);
    else realRoles.add(item.role);
  }

  return {
    availableRoles,
    realRoles,
    synthesizedRoles,
    hasFrames: availableRoles.has("start_frame") && availableRoles.has("end_frame"),
  };
}

function requiredRolesForTier(tier: FidelityTier): string[] {
  if (tier === "low") return ["front", "fit_anchor"];
  if (tier === "medium") return ["front", "fit_anchor", "three_quarter_side"];
  return ["front", "fit_anchor", "back", "three_quarter_left", "three_quarter_right"];
}

export function resolveRoleRequirements(tier: FidelityTier, coverage: RoleCoverage, signals: ParsedIntentSignals): RoleRequirements {
  const requiredRoles = new Set<string>(requiredRolesForTier(tier));
  const criticalRoles = new Set<string>(["front", "fit_anchor"]);

  if (tier === "high") criticalRoles.add("back");

  if (signals.hasBackReveal || signals.hasWalkAwayMotion) {
    requiredRoles.add("back");
    criticalRoles.add("back");
  }

  if (signals.hasTurningMotion) {
    requiredRoles.add("back");
    requiredRoles.add("three_quarter_side");
    criticalRoles.add("back");
  }

  if (signals.hasCloseupDetail) {
    requiredRoles.add("detail");
    criticalRoles.add("detail");
  }

  if (signals.hasWaterRotation) {
    requiredRoles.add("front");
    requiredRoles.add("fit_anchor");
    requiredRoles.add("back");
    requiredRoles.add("three_quarter_side");
    criticalRoles.add("back");
  }

  const resolvedRequiredRoles = [...requiredRoles];
  const missingRoles = resolvedRequiredRoles.filter((role) => {
    if (role === "three_quarter_side") return !SIDE_ROLES.some((side) => coverage.realRoles.has(side) || coverage.synthesizedRoles.has(side));
    return !coverage.availableRoles.has(role);
  });

  const criticalMissingRoles = [...criticalRoles].filter((role) => {
    if (role === "three_quarter_side") return !SIDE_ROLES.some((side) => coverage.realRoles.has(side));
    return !coverage.realRoles.has(role);
  });

  const allowedSynthesisRoles = tier === "high"
    ? ["detail", "context", ...SIDE_ROLES]
    : tier === "medium"
      ? [...SIDE_ROLES]
      : [];

  return {
    requiredRoles: resolvedRequiredRoles,
    missingRoles,
    criticalMissingRoles,
    allowedSynthesisRoles,
  };
}
