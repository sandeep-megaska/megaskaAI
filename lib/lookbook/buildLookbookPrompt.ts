import { createHash } from "crypto";
import type { LookbookConstraintProfile, LookbookExecutionPayload } from "@/lib/lookbook/types";

function buildGlobalIdentityPreservationBlock(constraints: LookbookConstraintProfile, outputStyle: LookbookExecutionPayload["outputStyle"]) {
  return [
    "WORKFLOW: Consistent Lookbook (catalog-consistent photoset).",
    `OUTPUT_STYLE: ${outputStyle}.`,
    "Global identity lock: keep the same model identity across every shot.",
    "Global garment lock: preserve exact garment structure from references.",
    "Preserve print placement, colorway, silhouette, trim, and seam layout exactly.",
    "Strict no-reconstruction policy is enabled.",
    constraints.preserveModelIdentity ? "Preserve model face/body identity and proportions across all images." : "",
    constraints.preserveGarmentStructure ? "Preserve garment panel construction and pattern geometry." : "",
    constraints.preservePrintPlacement ? "Preserve print placement coordinates and coverage." : "",
    constraints.preserveColorway ? "Preserve original colorway with no palette drift." : "",
    constraints.preserveSilhouette ? "Preserve silhouette and category shape." : "",
    constraints.preserveTrimAndSeamLayout ? "Preserve trims, stitch lines, and seam layout." : "",
    "Forbidden: redesign, reinterpretation, garment replacement, style drift.",
  ].filter(Boolean).join("\n");
}

function buildPerShotInstructionBlock(payload: Pick<LookbookExecutionPayload, "shot">) {
  return [
    `SHOT_KEY: ${payload.shot.shotKey}.`,
    `SHOT_TITLE: ${payload.shot.title}.`,
    `SHOT_INSTRUCTION: ${payload.shot.instruction}`,
    payload.shot.styleHint ? `SHOT_STYLE_HINT: ${payload.shot.styleHint}.` : "",
    payload.shot.aspectRatio ? `SHOT_ASPECT_RATIO: ${payload.shot.aspectRatio}.` : "",
  ].filter(Boolean).join("\n");
}

export function buildLookbookPrompt(payload: LookbookExecutionPayload) {
  const globalBlock = buildGlobalIdentityPreservationBlock(payload.constraints, payload.outputStyle);
  const shotBlock = buildPerShotInstructionBlock(payload);
  const prompt = [globalBlock, shotBlock].join("\n\n");
  const promptHash = createHash("sha256").update(prompt).digest("hex");

  return {
    prompt,
    promptHash,
    blocks: {
      globalIdentityPreservationBlock: globalBlock,
      perShotInstructionBlock: shotBlock,
    },
  };
}
