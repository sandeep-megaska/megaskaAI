import assert from "node:assert/strict";
import test from "node:test";
import { parseCreativeIntent } from "./intentParser";
import { planCreativeFidelity } from "./planner";
import { inferRequiredRoles } from "./roleInference";

test("motion parsing identifies jump and turn signals", () => {
  const parsed = parseCreativeIntent("model turns then jumps into water");
  assert.ok(parsed.motionSignals.includes("turn"));
  assert.ok(parsed.motionSignals.includes("jump_fall"));
});

test("scene and environment parser classifies surreal water scenario", () => {
  const parsed = parseCreativeIntent("alien world cinematic fall into river");
  assert.ok(parsed.sceneSignals.includes("alien_world"));
  assert.ok(parsed.environmentSignals.includes("water"));
});

test("required roles include back for back design prompt", () => {
  const parsed = parseCreativeIntent("turn and show the back design");
  const inferred = inferRequiredRoles(parsed);
  assert.ok(inferred.required_roles.includes("back"));
  assert.ok(inferred.critical_roles.includes("back"));
});

test("turning with missing back hard blocks", () => {
  const plan = planCreativeFidelity({
    prompt: "model turns and shows the back design",
    available_roles: ["front"],
  });
  assert.equal(plan.decision, "block");
  assert.ok(plan.critical_missing_roles.includes("back"));
});

test("cinematic surreal prompt becomes very high risk and blocks with limited anchors", () => {
  const plan = planCreativeFidelity({
    prompt: "model in swimwear jumps from an alien world into a river in a cinematic ad shot",
    available_roles: ["front"],
  });
  assert.equal(plan.decision, "block");
  assert.equal(plan.motion_complexity, "very_high");
  assert.equal(plan.scene_complexity, "very_high");
  assert.equal(plan.environment_risk, "very_high");
});

test("water risk escalation raises garment and environment risk", () => {
  const plan = planCreativeFidelity({
    prompt: "model jumps into river water",
    available_roles: ["front", "fit_anchor", "three_quarter_left", "three_quarter_right", "back"],
  });
  assert.equal(plan.environment_risk, "very_high");
  assert.ok(["high", "very_high"].includes(plan.garment_risk));
});

test("static safe shot proceeds", () => {
  const plan = planCreativeFidelity({
    prompt: "subtle breathing motion in the same studio",
    available_roles: ["front", "fit_anchor"],
  });
  assert.equal(plan.decision, "proceed");
});

test("walk on beach with side anchors is warn or proceed", () => {
  const plan = planCreativeFidelity({
    prompt: "model walks slowly on a beach with light breeze",
    available_roles: ["front", "fit_anchor", "three_quarter_left", "three_quarter_right"],
  });
  assert.ok(plan.decision === "warn" || plan.decision === "proceed");
});
