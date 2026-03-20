import type { MotionClassification, MotionIntent } from "@/lib/video/motion/types";

export function classifyMotion(intent: MotionIntent): MotionClassification {
  if (intent.motionCategory === "micro-motion") {
    return {
      motionCategory: "micro-motion",
      motionRiskLevel: "low",
      motionDrivenByAnchorsExpected: false,
      expectedAnchorBehavior: "Current anchors are usually enough; prompt can layer subtle expression changes.",
      suggestedAnchorPattern: "micro-expression-overlay",
    };
  }

  if (intent.motionCategory === "pose-transition") {
    return {
      motionCategory: "pose-transition",
      motionRiskLevel: "medium",
      motionDrivenByAnchorsExpected: true,
      expectedAnchorBehavior: "First/last anchors are primary drivers; moderate pose delta preferred.",
      suggestedAnchorPattern: "front-to-slight-turn",
    };
  }

  if (intent.motionCategory === "limb-motion") {
    return {
      motionCategory: "limb-motion",
      motionRiskLevel: "high",
      motionDrivenByAnchorsExpected: true,
      expectedAnchorBehavior: "Anchors should encode clear limb state differences.",
      suggestedAnchorPattern: "neutral-to-reach",
    };
  }

  if (intent.motionCategory === "interaction-motion") {
    return {
      motionCategory: "interaction-motion",
      motionRiskLevel: "high",
      motionDrivenByAnchorsExpected: true,
      expectedAnchorBehavior: "Anchors should include object/scene-specific hand-body placement.",
      suggestedAnchorPattern: "neutral-to-object-interaction",
    };
  }

  return {
    motionCategory: "sequence-motion",
    motionRiskLevel: "high",
    motionDrivenByAnchorsExpected: true,
    expectedAnchorBehavior: "Two anchors may collapse multi-step motion into one interpolation path.",
    suggestedAnchorPattern: "stand-to-bend",
  };
}
