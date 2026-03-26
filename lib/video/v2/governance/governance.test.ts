import assert from "node:assert/strict";
import { buildGarmentConstitution } from "@/lib/video/v2/governance/garmentConstitution";
import { assessTruthDebt } from "@/lib/video/v2/governance/truthDebt";
import { evaluateJudgePass } from "@/lib/video/v2/governance/judgePass";

void (() => {
  const constitution = buildGarmentConstitution({
    skuCode: "MGSW05",
    motionPrompt: "modest layered frock front to back reveal",
    items: [
      { role: "front", generation_id: "gen-front", source_kind: "sku_verified_truth", confidence_score: 0.95 },
    ],
  });

  assert.equal(constitution.riskTier, "tier3");
  assert.equal(constitution.silhouetteClass, "modest");

  const truthDebtBlocked = assessTruthDebt({
    startState: "front",
    endState: "back",
    garmentRiskTier: constitution.riskTier,
    silhouetteClass: constitution.silhouetteClass,
    coverageClass: constitution.coverageClass,
    motionComplexity: "dynamic",
    cameraComplexity: "simple",
    availableAnchors: constitution.canonicalTruthAssets.map((asset) => ({
      role: asset.role,
      sourceKind: asset.sourceKind,
      isVerified: asset.isVerified,
    })),
    hasTransitionTruth: false,
    backRevealRequested: true,
    silhouetteRisk: "high",
    printContinuityRisk: "medium",
  });

  assert.equal(truthDebtBlocked.decision, "block");
  assert.ok(truthDebtBlocked.requiredNextAnchors.includes("back"));

  const judged = evaluateJudgePass({
    clipIntentId: "clip-1",
    garment: {
      riskTier: "tier3",
      silhouetteClass: "layered",
      coverageClass: "high",
    },
    overallFidelityScore: 82,
    violations: [
      { code: "layer_loss", severity: "high", message: "Outer layer disappears during turn.", segmentId: "seg-1" },
      { code: "print_drift", severity: "medium", message: "Print panel misaligns on back.", segmentId: "seg-1" },
    ],
    segments: [
      {
        segmentId: "seg-1",
        fidelityScore: 54,
        violations: [
          { code: "layer_loss", severity: "high", message: "Outer layer disappears during turn.", segmentId: "seg-1" },
        ],
      },
    ],
  });

  assert.equal(judged.outcome, "salvageable");
  assert.ok(judged.salvageActions.includes("reduce_motion_and_retry"));
})();
