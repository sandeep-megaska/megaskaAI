import type { ParsedIntentSignals, RoleInference } from "./types";

const BASE_REQUIRED_ROLES = ["front", "fit_anchor"];

function addRole(set: Set<string>, role: string) {
  if (role) set.add(role);
}

export function inferRequiredRoles(signals: ParsedIntentSignals): RoleInference {
  const required = new Set<string>(BASE_REQUIRED_ROLES);
  const critical = new Set<string>(BASE_REQUIRED_ROLES);

  const hasTurnLikeMotion = signals.motionSignals.some((signal) => ["turn", "twirl_spin", "jump_fall", "run"].includes(signal));
  const hasWaterOrExtremeEnvironment = signals.environmentSignals.some((signal) => ["water", "splash", "rain"].includes(signal));
  const hasSurrealScene = signals.sceneSignals.some((signal) => ["alien_world", "fantasy_surreal", "scene_transition", "underwater"].includes(signal));

  if (signals.garmentSignals.includes("back_design") || signals.viewSignals.includes("back")) {
    addRole(required, "back");
    addRole(critical, "back");
  }

  if (signals.viewSignals.includes("side_profile") || hasTurnLikeMotion) {
    addRole(required, "three_quarter_left");
    addRole(required, "three_quarter_right");
    addRole(critical, "three_quarter_left");
    addRole(critical, "three_quarter_right");
  }

  if (signals.viewSignals.includes("rotation") || hasTurnLikeMotion) {
    addRole(required, "back");
    addRole(critical, "back");
  }

  if (signals.viewSignals.includes("closeup_detail") || signals.garmentSignals.includes("texture")) {
    addRole(required, "detail");
    addRole(critical, "detail");
  }

  if (signals.sceneSignals.includes("scene_transition") || hasSurrealScene) {
    addRole(required, "context");
  }

  if (hasWaterOrExtremeEnvironment || hasSurrealScene) {
    addRole(required, "back");
    addRole(required, "three_quarter_left");
    addRole(required, "three_quarter_right");
    addRole(critical, "back");
    addRole(critical, "three_quarter_left");
    addRole(critical, "three_quarter_right");
  }

  return {
    required_roles: Array.from(required),
    critical_roles: Array.from(critical),
  };
}
