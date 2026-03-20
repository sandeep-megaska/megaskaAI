import type { AnchorGapAnalysis, AnchorSuitabilityStatus, MotionClassification } from "@/lib/video/motion/types";

type ValidateAnchorsForMotionInput = {
  classification: MotionClassification;
  gap: AnchorGapAnalysis;
  hasMandatoryAnchors: boolean;
};

export function validateAnchorsForMotion(input: ValidateAnchorsForMotionInput): {
  anchorSuitabilityStatus: AnchorSuitabilityStatus;
  motionWarnings: string[];
} {
  const warnings: string[] = [...input.gap.anchorGapWarnings];
  let status: AnchorSuitabilityStatus = "valid";

  if (!input.hasMandatoryAnchors) {
    warnings.push("Protected core anchor set is incomplete; diagnostics are less reliable.");
    status = "incompatible";
  }

  if (input.classification.motionCategory === "interaction-motion") {
    warnings.push("Requested interaction motion may need anchors showing hand/object positioning.");
    if (input.gap.anchorMotionPatternGuess === "strong-front-to-back-change") {
      warnings.push("Current anchors appear to encode only a turn, not the requested action.");
      status = "weak";
    }
  }

  if (input.classification.motionCategory === "limb-motion" && input.gap.anchorGapLevel === "low") {
    warnings.push("Limb-motion prompt detected but anchors appear too similar.");
    status = status === "incompatible" ? status : "weak";
  }

  if (input.classification.motionCategory === "sequence-motion") {
    warnings.push("Prompt requests multi-step motion, but only two anchor states are available.");
    status = status === "incompatible" ? status : "weak";
  }

  if (input.classification.motionCategory === "micro-motion" && status === "valid") {
    warnings.push("Micro-motion usually works with current protected anchors and prompt guidance.");
  }

  if (input.gap.anchorGapLevel === "high" && input.classification.motionCategory !== "micro-motion") {
    warnings.push("Large anchor gap may force generic interpolation over action detail.");
    if (status === "valid") status = "weak";
  }

  return {
    anchorSuitabilityStatus: status,
    motionWarnings: Array.from(new Set(warnings)),
  };
}
