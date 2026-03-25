import assert from "node:assert/strict";
import { planCreativeFidelity } from "@/lib/video/v2/creativeFidelity/planner";

function baseItems() {
  return [
    { role: "front", generation_id: "gen-front", source_kind: "captured" },
    { role: "fit_anchor", generation_id: "gen-fit", source_kind: "captured" },
    { role: "three_quarter_left", generation_id: "gen-left", source_kind: "captured" },
    { role: "three_quarter_right", generation_id: "gen-right", source_kind: "captured" },
    { role: "back", generation_id: "gen-back", source_kind: "captured" },
  ];
}

(() => {
  const safePlan = planCreativeFidelity({
    clipIntentId: "clip-1",
    workingPackId: "pack-1",
    motionPrompt: "Static product hero shot with subtle breathing",
    items: baseItems(),
  });
  assert.equal(safePlan.decision, "proceed");

  const turningMissingBack = planCreativeFidelity({
    clipIntentId: "clip-2",
    workingPackId: "pack-1",
    motionPrompt: "Model turns around in a full rotation",
    items: baseItems().filter((item) => item.role !== "back"),
  });
  assert.equal(turningMissingBack.decision, "block");
  assert.ok(turningMissingBack.criticalMissingRoles.includes("back"));

  const surrealInsufficient = planCreativeFidelity({
    clipIntentId: "clip-3",
    workingPackId: "pack-1",
    motionPrompt: "Surreal cinematic levitating spin around the model",
    items: baseItems().filter((item) => item.role === "front" || item.role === "fit_anchor"),
  });
  assert.equal(surrealInsufficient.decision, "block");

  const waterEscalation = planCreativeFidelity({
    clipIntentId: "clip-4",
    workingPackId: "pack-1",
    motionPrompt: "Walk through shallow water with light rain",
    items: baseItems(),
  });
  assert.ok(["warn", "proceed"].includes(waterEscalation.decision));
  assert.equal(waterEscalation.riskSummary.waterExposure, true);

  const synthesizedSideWarn = planCreativeFidelity({
    clipIntentId: "clip-5",
    workingPackId: "pack-1",
    motionPrompt: "Three quarter side turn with controlled camera movement",
    items: [
      { role: "front", generation_id: "gen-front", source_kind: "captured" },
      { role: "fit_anchor", generation_id: "gen-fit", source_kind: "captured" },
      { role: "three_quarter_left", generation_id: "gen-left", source_kind: "synthesized" },
      { role: "three_quarter_right", generation_id: "gen-right", source_kind: "synthesized" },
    ],
  });
  assert.equal(synthesizedSideWarn.decision, "warn");
})();
