import { DEFAULT_FORBIDDEN_TRANSFORMS, VERIFIED_TRUTH_SOURCE_KINDS } from "@/lib/video/v2/governance/rules";
import type { GarmentConstitution, GarmentCoverageClass, GarmentRiskTier, GarmentSilhouetteClass } from "@/lib/video/v2/governance/types";

type BuildGarmentConstitutionInput = {
  skuCode: string;
  items: Array<{
    role: string;
    generation_id: string | null;
    source_kind: string;
    confidence_score?: number | null;
  }>;
  motionPrompt: string;
};

function inferRiskTier(input: { motionPrompt: string; hasVerifiedBack: boolean; hasLayerHints: boolean }): GarmentRiskTier {
  if (input.hasLayerHints) return "tier3";
  if (/\b(front\s*to\s*back|back\s*reveal|walk\s*away|turn)\b/i.test(input.motionPrompt) && !input.hasVerifiedBack) return "tier3";
  if (/\b(detail|closeup|pose)\b/i.test(input.motionPrompt)) return "tier1";
  return "tier2";
}

function inferSilhouetteClass(prompt: string): GarmentSilhouetteClass {
  if (/\b(modest|abaya|frock)\b/i.test(prompt)) return "modest";
  if (/\b(layered|jacket|dupatta|overlay)\b/i.test(prompt)) return "layered";
  if (/\b(structured|tailored|blazer|corset)\b/i.test(prompt)) return "structured";
  if (/\b(flowy|drape|loose)\b/i.test(prompt)) return "flowy";
  if (/\b(a-line|aline)\b/i.test(prompt)) return "a_line";
  return "fitted";
}

function inferCoverageClass(prompt: string): GarmentCoverageClass {
  if (/\b(full\s*coverage|maxi|ankle|long\s*sleeve|hijab)\b/i.test(prompt)) return "full";
  if (/\b(modest|high\s*neck|layered)\b/i.test(prompt)) return "high";
  if (/\b(sleeveless|short\s*sleeve|knee)\b/i.test(prompt)) return "medium";
  return "low";
}

export function buildGarmentConstitution(input: BuildGarmentConstitutionInput): GarmentConstitution {
  const canonicalTruthAssets = input.items
    .filter((item) => item.generation_id)
    .map((item) => ({
      role: item.role,
      generationId: item.generation_id as string,
      sourceKind: item.source_kind,
      isVerified: VERIFIED_TRUTH_SOURCE_KINDS.has(String(item.source_kind ?? "").toLowerCase()),
      confidenceScore: Number(item.confidence_score ?? 0),
    }));

  const silhouetteClass = inferSilhouetteClass(input.motionPrompt);
  const coverageClass = inferCoverageClass(input.motionPrompt);
  const hasVerifiedBack = canonicalTruthAssets.some((asset) => asset.role === "back" && asset.isVerified);
  const hasLayerHints = silhouetteClass === "layered" || silhouetteClass === "modest";

  const riskTier = inferRiskTier({
    motionPrompt: input.motionPrompt,
    hasVerifiedBack,
    hasLayerHints,
  });

  return {
    skuCode: input.skuCode,
    riskTier,
    silhouetteClass,
    coverageClass,
    canonicalTruthAssets,
    geometryRules: [
      "Preserve hemline silhouette and garment length proportions.",
      "Preserve neckline geometry and strap placement.",
      "Maintain panel boundaries and seam topology.",
    ],
    designPreservationRules: [
      "Maintain print/embroidery motif placement continuity.",
      "Do not redesign back pattern or closure.",
      "Preserve layer ordering for layered/modest garments.",
    ],
    toleranceRules: {
      hemLengthDeltaPctMax: 3,
      necklineDeltaPctMax: 2,
      printDriftPctMax: 4,
      silhouetteVariancePctMax: 5,
    },
    forbiddenTransformations: [...DEFAULT_FORBIDDEN_TRANSFORMS],
    notes: hasVerifiedBack ? [] : ["Back truth is not verified; front->back motion should be constrained."],
  };
}

export function evaluateConstitutionCoverage(input: { constitution: GarmentConstitution; requiredRoles: string[] }) {
  const availableRoles = new Set(input.constitution.canonicalTruthAssets.map((asset) => asset.role));
  const missingRequiredRoles = input.requiredRoles.filter((role) => !availableRoles.has(role));
  const missingVerifiedRoles = input.requiredRoles.filter((role) => {
    const match = input.constitution.canonicalTruthAssets.find((asset) => asset.role === role);
    return !match?.isVerified;
  });

  return {
    complete: missingRequiredRoles.length === 0,
    missingRequiredRoles,
    missingVerifiedRoles,
  };
}
