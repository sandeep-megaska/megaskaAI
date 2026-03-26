import assert from "node:assert/strict";
import { buildSkuTruthCandidates, suggestRoleForCandidate } from "@/lib/video/v2/skuTruth/ui";

(() => {
  assert.equal(suggestRoleForCandidate({ sourceRole: "back", sourceKind: "reused" }), "back");
  assert.equal(suggestRoleForCandidate({ sourceRole: null, sourceKind: "three_quarter_right_generated" }), "three_quarter_right");
  assert.equal(suggestRoleForCandidate({ sourceRole: null, sourceKind: "manual_verified_override" }), null);
})();

(() => {
  const candidates = buildSkuTruthCandidates([
    {
      id: "item-1",
      role: "back",
      source_kind: "reused_existing",
      generation_id: "gen-back",
      generation: { id: "gen-back", thumbnail_url: "https://example.com/back-thumb.jpg", asset_url: "https://example.com/back.jpg" },
    },
    {
      id: "item-2",
      role: "front",
      source_kind: "expanded_generated",
      generation_id: "gen-front",
      generation: { id: "gen-front", url: "https://example.com/front.jpg" },
    },
    {
      id: "item-3",
      role: "front",
      source_kind: "expanded_generated",
      generation_id: "gen-front",
      generation: { id: "gen-front", url: "https://example.com/front-v2.jpg" },
    },
  ]);

  assert.equal(candidates.length, 2);
  assert.equal(candidates[0]?.generationId, "gen-back");
  assert.equal(candidates[0]?.suggestedRole, "back");
  assert.equal(candidates[1]?.thumbnailUrl, "https://example.com/front.jpg");
})();
