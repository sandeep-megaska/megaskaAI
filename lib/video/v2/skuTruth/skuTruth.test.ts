import assert from "node:assert/strict";
import { truthPriorityScore } from "@/lib/video/v2/skuTruth/ranking";

(() => {
  assert.ok(truthPriorityScore("manual_verified_override") > truthPriorityScore("reused_existing"));
  assert.ok(truthPriorityScore("sku_verified_truth") > truthPriorityScore("expanded_generated"));
  assert.ok(truthPriorityScore("expanded_generated") > truthPriorityScore("synthesized_support"));
})();
