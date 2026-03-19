import { randomUUID } from "node:crypto";
import type { VideoInputMode } from "@/lib/video/promptBuilder";
import type { DecomposedBeat } from "@/lib/video/sequence/decomposePromptToShots";
import type { VideoShotPlanItem } from "@/lib/video/sequence/types";

function durationForBeat(index: number, complexity: "low" | "medium" | "high") {
  if (complexity === "high") return 4;
  if (complexity === "medium") return 3;
  return index === 0 ? 3 : 2;
}

function providerPreferenceForShot(shotType: VideoShotPlanItem["shotType"]): VideoShotPlanItem["providerPreference"] {
  if (shotType === "motion") return "motion-strong";
  if (shotType === "effect") return "experimental";
  if (shotType === "transition") return "continuity";
  return "conservative";
}

export function planShots(input: {
  sequenceId?: string;
  beats: DecomposedBeat[];
  invariantsPrompt: string;
  styleHint?: string | null;
  inputStrategy: VideoInputMode;
  selectedReferenceSubset: string[];
  selectedAnchorIds: string[];
}): { sequenceId: string; shotPlan: VideoShotPlanItem[] } {
  const sequenceId = input.sequenceId ?? randomUUID();
  const shotIds = input.beats.map((_, index) => `shot-${index + 1}-${randomUUID().slice(0, 8)}`);

  const shotPlan = input.beats.map((beat, index) => {
    const shotId = shotIds[index] ?? `shot-${index + 1}-${randomUUID().slice(0, 8)}`;
    const previousShotId = index > 0 ? shotIds[index - 1] : null;
    return {
      shotId,
      sequenceId,
      sequenceIndex: index,
      shotType: beat.shotType,
      title: beat.title,
      actionPrompt: beat.actionPrompt,
      invariantsPrompt: input.invariantsPrompt,
      styleHint: input.styleHint?.trim() || null,
      targetDurationSeconds: durationForBeat(index, beat.complexity),
      motionRiskLevel: beat.motionRiskLevel,
      providerPreference: providerPreferenceForShot(beat.shotType),
      inputStrategy: input.inputStrategy,
      continuityFromShotId: previousShotId,
      selectedAnchorIds: input.selectedAnchorIds,
      selectedReferenceSubset: input.selectedReferenceSubset,
      status: "planned",
      generatedCandidateIds: [],
      selectedCandidateId: null,
      stitchedIntoFinalVideo: false,
      continuitySource: previousShotId ? { type: "anchor-package", sourceShotId: previousShotId } : null,
      diagnostics: {
        decompositionComplexity: beat.complexity,
      },
    } satisfies VideoShotPlanItem;
  });

  return { sequenceId, shotPlan };
}
