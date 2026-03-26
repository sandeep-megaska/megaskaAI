import test from "node:test";
import assert from "node:assert/strict";

import { PHASE1_TEMPLATES, getPhase1TemplateById, buildTemplatePromptScaffold, getTemplateReadiness } from "../lib/video/v2/templateMode.ts";


test("phase-1 template catalog is explicit and production-safe", () => {
  assert.equal(PHASE1_TEMPLATES.length, 8);
  for (const template of PHASE1_TEMPLATES) {
    assert.equal(template.production_safe, true);
    assert.ok(template.required_roles.length >= 1);
  }
});

test("template readiness maps required roles deterministically", () => {
  const template = getPhase1TemplateById("front_still_luxury");
  assert.ok(template);

  const ready = getTemplateReadiness(template, ["front", "fit_anchor"]);
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.missingRoles, []);

  const missing = getTemplateReadiness(template, ["front"]);
  assert.equal(missing.ready, false);
  assert.deepEqual(missing.missingRoles, ["fit_anchor"]);
});

test("front-to-back reveal template requires frames_to_video and exact end-state", () => {
  const template = getPhase1TemplateById("front_to_back_controlled_reveal");
  assert.ok(template);
  assert.equal(template.mode_preference, "frames_to_video");
  assert.equal(template.requires_exact_end_state, true);
  assert.ok(template.verification_requirements.length >= 2);
});

test("unsupported template combinations show missing roles honestly", () => {
  const template = getPhase1TemplateById("front_to_back_controlled_reveal");
  assert.ok(template);
  const readiness = getTemplateReadiness(template, ["front", "fit_anchor"]);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.missingRoles.includes("start_frame"));
  assert.ok(readiness.missingRoles.includes("end_frame"));
});

test("simple front template remains runnable with front + fit truth only", () => {
  const template = getPhase1TemplateById("front_still_luxury");
  assert.ok(template);
  const readiness = getTemplateReadiness(template, ["front", "fit_anchor"]);
  assert.equal(template.mode_preference, "ingredients_to_video");
  assert.equal(readiness.ready, true);
});

test("template registry remains separate from experimental free-form path", () => {
  const constrainedIds = new Set(PHASE1_TEMPLATES.map((template) => template.template_id));
  assert.equal(constrainedIds.has("front_still_luxury"), true);
  assert.equal(constrainedIds.has("nonexistent_freeform"), false);
});

test("template prompt scaffold generation is deterministic", () => {
  const template = getPhase1TemplateById("detail_close_up_motion");
  assert.ok(template);
  const scaffoldA = buildTemplatePromptScaffold(template, "sunlit studio");
  const scaffoldB = buildTemplatePromptScaffold(template, "sunlit studio");
  assert.equal(scaffoldA, scaffoldB);
  assert.ok(scaffoldA.includes("Template: Detail Close-Up Motion"));
});
