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

function buildPerShotInstructionBlock(payload: Pick<LookbookExecutionPayload, "shot" | "jobVariant" | "themeKey">) {
  const variantInstructions = payload.jobVariant === "lifestyle"
    ? [
      "MODE_DIRECTIVE: Lifestyle Photoshoot.",
      "Create a premium editorial scene-driven image.",
      "Allow variation in background, pose, expression, and lighting mood.",
      "Do not change garment identity, garment construction, or print geometry.",
      payload.themeKey ? `THEME_KEY: ${payload.themeKey}.` : "",
    ]
    : [
      "MODE_DIRECTIVE: Catalog Lookbook.",
      "Maintain technical catalog clarity, clean separation, and production-ready framing.",
    ];

  return [
    ...variantInstructions,
    `SHOT_KEY: ${payload.shot.shotKey}.`,
    `SHOT_TITLE: ${payload.shot.title}.`,
    `SHOT_INSTRUCTION: ${payload.shot.instruction}`,
    payload.shot.styleHint ? `SHOT_STYLE_HINT: ${payload.shot.styleHint}.` : "",
    payload.shot.aspectRatio ? `SHOT_ASPECT_RATIO: ${payload.shot.aspectRatio}.` : "",
    payload.shot.framing ? `SHOT_FRAMING: ${payload.shot.framing}.` : "",
    payload.shot.angle ? `SHOT_ANGLE: ${payload.shot.angle}.` : "",
    payload.shot.backgroundStyle ? `SHOT_BACKGROUND_STYLE: ${payload.shot.backgroundStyle}.` : "",
    payload.shot.poseInstruction ? `SHOT_POSE_INSTRUCTION: ${payload.shot.poseInstruction}.` : "",
    payload.shot.sceneKey ? `SCENE_KEY: ${payload.shot.sceneKey}.` : "",
    payload.shot.poseKey ? `POSE_KEY: ${payload.shot.poseKey}.` : "",
    payload.shot.moodKey ? `MOOD_KEY: ${payload.shot.moodKey}.` : "",
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
