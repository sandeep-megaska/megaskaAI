import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPhase2EvaluationRecord,
  classifyPhase2Verdict,
  summarizePhase2TemplateHealth,
} from "../lib/video/v2/phase2Evaluation.ts";
import { findRecentPhase2HardFailConfigMatch, normalizeRunMode } from "../lib/video/v2/runMode.ts";

test("phase-2 classification logic returns pass/soft_fail/hard_fail deterministically", () => {
  assert.equal(classifyPhase2Verdict({ garment_truth_ok: true, identity_stable: true, motion_within_template: true, commercially_usable: true }), "pass");
  assert.equal(classifyPhase2Verdict({ garment_truth_ok: true, identity_stable: true, motion_within_template: true, commercially_usable: false }), "soft_fail");
  assert.equal(classifyPhase2Verdict({ garment_truth_ok: false, identity_stable: true, motion_within_template: true, commercially_usable: true }), "hard_fail");
});

test("hard fail is triggered by garment drift conditions", () => {
  const health = summarizePhase2TemplateHealth([]);
  const evaluation = buildPhase2EvaluationRecord({
    template_id: "front_premium_hold",
    garment_truth_ok: false,
    identity_stable: true,
    motion_within_template: true,
    commercially_usable: true,
    health,
  });
  assert.equal(evaluation.verdict, "hard_fail");
});

test("retry warning detects recent phase-2 hard fail on same config", () => {
  const signature = "sig-phase2";
  const match = findRecentPhase2HardFailConfigMatch([
    { id: "run-pass", created_at: new Date().toISOString(), run_meta: { config_signature: signature, phase2_evaluation: { verdict: "pass" } } },
    { id: "run-hard", created_at: new Date().toISOString(), run_meta: { config_signature: signature, phase2_evaluation: { verdict: "hard_fail" } } },
  ], signature, 72);
  assert.equal(match?.id, "run-hard");
});

test("template health summary counts verdicts and guidance thresholds", () => {
  const summary = summarizePhase2TemplateHealth([
    { verdict: "pass", garment_truth_ok: true },
    { verdict: "pass", garment_truth_ok: true },
    { verdict: "pass", garment_truth_ok: true },
    { verdict: "soft_fail", garment_truth_ok: true },
    { verdict: "soft_fail", garment_truth_ok: true },
  ]);
  assert.equal(summary.passes, 3);
  assert.equal(summary.soft_fails, 2);
  assert.equal(summary.hard_fails, 0);
  assert.equal(summary.should_approve_template, true);
  assert.equal(summary.should_pause_template, false);
});

test("existing production mode flow helpers remain unchanged", () => {
  assert.equal(normalizeRunMode("production"), "production");
  assert.equal(normalizeRunMode("validation"), "validation");
});
