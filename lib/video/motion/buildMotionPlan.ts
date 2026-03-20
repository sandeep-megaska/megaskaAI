import { analyzeAnchorGap } from "@/lib/video/motion/analyzeAnchorGap";
import { classifyMotion } from "@/lib/video/motion/classifyMotion";
import { extractMotionIntent } from "@/lib/video/motion/extractMotionIntent";
import type { MotionPlan } from "@/lib/video/motion/types";
import { validateAnchorsForMotion } from "@/lib/video/motion/validateAnchorsForMotion";

type BuildMotionPlanInput = {
  prompt: string;
  protectedCoreFlowEnabled: true;
  hasMandatoryAnchors: boolean;
  firstFrameUrl?: string | null;
  lastFrameUrl?: string | null;
  firstFrameGenerationId?: string | null;
  lastFrameGenerationId?: string | null;
};

function buildFutureSuggestedStates(category: MotionPlan["motionCategory"]) {
  if (category === "interaction-motion") return ["approach-object", "contact-object", "release-object"];
  if (category === "limb-motion") return ["neutral-limb", "extended-limb"];
  if (category === "sequence-motion") return ["start-pose", "middle-action", "end-pose"];
  if (category === "pose-transition") return ["front-pose", "three-quarter-pose"];
  return ["micro-expression-start", "micro-expression-end"];
}

export function buildMotionPlan(input: BuildMotionPlanInput): MotionPlan {
  const intent = extractMotionIntent(input.prompt);
  const classification = classifyMotion(intent);
  const gap = analyzeAnchorGap({
    firstFrameUrl: input.firstFrameUrl,
    lastFrameUrl: input.lastFrameUrl,
    firstFrameGenerationId: input.firstFrameGenerationId,
    lastFrameGenerationId: input.lastFrameGenerationId,
  });
  const validation = validateAnchorsForMotion({
    classification,
    gap,
    hasMandatoryAnchors: input.hasMandatoryAnchors,
  });

  return {
    motionPlanVersion: "anchor-motion-v1",
    protectedCoreFlowEnabled: input.protectedCoreFlowEnabled,
    motionCategory: classification.motionCategory,
    primaryAction: intent.primaryAction,
    secondaryAction: intent.secondaryAction,
    motionRiskLevel: classification.motionRiskLevel,
    actionCount: intent.actionCount,
    motionDrivenByAnchorsExpected: classification.motionDrivenByAnchorsExpected,
    expectedAnchorBehavior: classification.expectedAnchorBehavior,
    suggestedAnchorPattern: classification.suggestedAnchorPattern,
    anchorSuitabilityStatus: validation.anchorSuitabilityStatus,
    motionWarnings: validation.motionWarnings,
    anchorGapLevel: gap.anchorGapLevel,
    anchorMotionPatternGuess: gap.anchorMotionPatternGuess,
    anchorGapWarnings: gap.anchorGapWarnings,
    motionDiagnostics: {
      motionComplexity: intent.motionComplexity,
      objectInteraction: intent.objectInteraction,
      sceneInteraction: intent.sceneInteraction,
      motionCategoryDetectedFromPrompt: intent.motionCategory,
    },
    actionSpecificAnchorRecommended: classification.motionCategory === "interaction-motion" || classification.motionCategory === "limb-motion",
    multiAnchorSequenceRecommended: classification.motionCategory === "sequence-motion",
    futureSuggestedAnchorStates: buildFutureSuggestedStates(classification.motionCategory),
  };
}
