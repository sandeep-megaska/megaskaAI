export const VIDEO_SIMPLE_REFERENCE_LIMIT = 3;

export const VIDEO_SIMPLE_MOTION_PRESETS = [
  "freeform",
  "slow-pivot",
  "turn-and-settle",
  "camera-orbit",
  "back-reveal-hold",
  "over-shoulder-reveal",
] as const;

export type VideoSimpleMotionPreset = (typeof VIDEO_SIMPLE_MOTION_PRESETS)[number];

export type VideoSimpleReferenceRole = "front" | "back" | "side";

export type VideoSimpleGarmentAnchors = {
  backNeckline: string;
  strapStructure: string;
  backCoverage: string;
  seamLines: string;
  fabricFinish: string;
  colorContinuity: string;
};

export type VideoSimpleReferenceImage = {
  url: string;
  role: VideoSimpleReferenceRole;
};

export type VideoSimplePreflightInput = {
  prompt: string;
  motionPreset: VideoSimpleMotionPreset;
  startFrameAspectRatio?: number | null;
  intermediateFrameAspectRatio?: number | null;
  endFrameAspectRatio?: number | null;
  workflowMode: VideoSimpleWorkflowMode;
  hasIntermediateFrame: boolean;
  hasEndFrame: boolean;
  referenceImages: VideoSimpleReferenceImage[];
  garmentAnchors: VideoSimpleGarmentAnchors;
};

export type VideoSimpleWorkflowMode = "single-shot" | "two-shot-back-reveal";
export type VideoSimpleShotType = "single" | "shot-a" | "shot-b";

export function createEmptyGarmentAnchors(): VideoSimpleGarmentAnchors {
  return {
    backNeckline: "",
    strapStructure: "",
    backCoverage: "",
    seamLines: "",
    fabricFinish: "",
    colorContinuity: "",
  };
}

const MOTION_PRESET_INSTRUCTIONS: Record<VideoSimpleMotionPreset, string> = {
  freeform: "Use natural cinematic motion that follows the prompt.",
  "slow-pivot": "Use a slow, controlled pivot turn and discourage aggressive body deformation.",
  "turn-and-settle": "Turn smoothly into the target pose, then settle into a stable end hold.",
  "camera-orbit": "Keep the subject stable while the camera performs a gentle orbit around the subject.",
  "back-reveal-hold": "Reveal the back view clearly, then hold the back view for readability.",
  "over-shoulder-reveal": "Use an over-shoulder reveal that keeps garment structure readable during the turn.",
};

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function hasAnyBackIntent(prompt: string): boolean {
  return /\b(back|backside|rear|turn\s+around|turns?\s+back|spin\s+around)\b/i.test(prompt);
}

function summarizeGarmentAnchorsInternal(anchors: VideoSimpleGarmentAnchors): string[] {
  const entries: Array<[string, string]> = [
    ["back neckline geometry", anchors.backNeckline],
    ["strap placement", anchors.strapStructure],
    ["back coverage silhouette", anchors.backCoverage],
    ["seam lines and paneling", anchors.seamLines],
    ["fabric finish and texture", anchors.fabricFinish],
    ["color or print continuity", anchors.colorContinuity],
  ];

  return entries
    .map(([label, value]) => [label, normalizeText(value)] as const)
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `${label}: ${value}`);
}

export function summarizeGarmentAnchors(anchors: VideoSimpleGarmentAnchors): string {
  const lines = summarizeGarmentAnchorsInternal(anchors);
  return lines.length ? lines.join("; ") : "";
}

export function normalizeReferenceImagesForProvider(referenceImages: VideoSimpleReferenceImage[]): VideoSimpleReferenceImage[] {
  const deduped: VideoSimpleReferenceImage[] = [];
  const seen = new Set<string>();

  for (const image of referenceImages) {
    const url = normalizeText(image.url);
    if (!url) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    deduped.push({ url, role: image.role });
    if (deduped.length >= VIDEO_SIMPLE_REFERENCE_LIMIT) break;
  }

  return deduped;
}

export function createWorkflowGroupId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `wf-${Date.now()}-${randomSuffix}`;
}

function resolveMotionInstructionForShot(input: {
  motionPreset: VideoSimpleMotionPreset;
  workflowMode: VideoSimpleWorkflowMode;
  shotType: VideoSimpleShotType;
}) {
  const baseInstruction = input.motionPreset === "freeform" ? null : MOTION_PRESET_INSTRUCTIONS[input.motionPreset];
  if (input.workflowMode !== "two-shot-back-reveal") {
    return baseInstruction;
  }

  if (input.shotType === "shot-a") {
    return "Use a slow controlled partial pivot from front toward a rear three-quarter view; avoid aggressive pose deformation.";
  }

  if (input.shotType === "shot-b") {
    return "Continue from rear three-quarter framing to a stable full back reveal with minimal body distortion.";
  }

  return baseInstruction;
}

export function buildShotPrompt(input: {
  creativePrompt: string;
  motionPreset: VideoSimpleMotionPreset;
  hasEndFrame: boolean;
  referenceImages: VideoSimpleReferenceImage[];
  garmentAnchors: VideoSimpleGarmentAnchors;
  workflowMode: VideoSimpleWorkflowMode;
  shotType: VideoSimpleShotType;
}): string {
  const creativePrompt = normalizeText(input.creativePrompt);
  const lines: string[] = [creativePrompt];

  const motionInstruction = resolveMotionInstructionForShot({
    motionPreset: input.motionPreset,
    workflowMode: input.workflowMode,
    shotType: input.shotType,
  });
  if (motionInstruction) {
    lines.push(motionInstruction);
  }

  if (input.workflowMode === "two-shot-back-reveal" && input.shotType === "shot-a") {
    lines.push("End frame must align to the supplied intermediate anchor composition.");
    lines.push("Preserve visible neckline and strap geometry while transitioning toward rear three-quarter framing.");
  }

  if (input.workflowMode === "two-shot-back-reveal" && input.shotType === "shot-b") {
    lines.push("Continue motion naturally from the intermediate anchor into the final back anchor.");
    lines.push("Preserve exact back cut, strap layout, seam lines, and silhouette in the final hold.");
  }

  if (input.referenceImages.length) {
    lines.push("Match garment and subject identity to the supplied reference images.");
  }

  if (input.referenceImages.some((image) => image.role === "back")) {
    lines.push("Preserve exact neckline geometry, maintain strap placement, and avoid redesign of the back cut.");
  }

  const anchorSummary = summarizeGarmentAnchorsInternal(input.garmentAnchors);
  if (anchorSummary.length) {
    lines.push(`Garment anchors to preserve: ${anchorSummary.join("; ")}.`);
  }

  if (input.hasEndFrame) {
    lines.push("Finish aligned to the supplied final frame composition.");
  }

  if (input.workflowMode === "two-shot-back-reveal") {
    lines.push("Keep movement controlled and continuity-safe. Do not invent new garment geometry.");
  }

  if (input.referenceImages.length || anchorSummary.length || input.hasEndFrame || hasAnyBackIntent(creativePrompt)) {
    lines.push("Maintain the same fabric appearance and avoid unnecessary garment redesign artifacts.");
  }

  return lines.join(" ");
}

export function buildTwoShotVideoPrompt(input: {
  creativePrompt: string;
  motionPreset: VideoSimpleMotionPreset;
  hasEndFrame: boolean;
  referenceImages: VideoSimpleReferenceImage[];
  garmentAnchors: VideoSimpleGarmentAnchors;
  shotType: Extract<VideoSimpleShotType, "shot-a" | "shot-b">;
}) {
  return buildShotPrompt({
    ...input,
    workflowMode: "two-shot-back-reveal",
    shotType: input.shotType,
  });
}

export function buildVideoSimplePrompt(input: {
  creativePrompt: string;
  motionPreset: VideoSimpleMotionPreset;
  hasEndFrame: boolean;
  referenceImages: VideoSimpleReferenceImage[];
  garmentAnchors: VideoSimpleGarmentAnchors;
}): string {
  return buildShotPrompt({
    ...input,
    workflowMode: "single-shot",
    shotType: "single",
  });
}

export function validateVideoSimpleControls(input: VideoSimplePreflightInput): string[] {
  const warnings: string[] = [];

  if (typeof input.startFrameAspectRatio === "number" && typeof input.endFrameAspectRatio === "number") {
    const ratioDelta = Math.abs(input.startFrameAspectRatio - input.endFrameAspectRatio);
    if (ratioDelta > 0.08) {
      warnings.push("Start and end frames have different aspect ratios, which may weaken continuity.");
    }
  }

  if (input.workflowMode === "two-shot-back-reveal") {
    if (!input.hasIntermediateFrame) {
      warnings.push("Two-shot mode needs an Intermediate Anchor frame to split the reveal into safer transitions.");
    }

    if (!input.hasEndFrame) {
      warnings.push("Two-shot Shot 2 is more reliable with a final End frame for exact back-view alignment.");
    }

    if (typeof input.startFrameAspectRatio === "number" && typeof input.intermediateFrameAspectRatio === "number") {
      const firstGap = Math.abs(input.startFrameAspectRatio - input.intermediateFrameAspectRatio);
      if (firstGap > 0.08) {
        warnings.push("Start and Intermediate anchors use different aspect ratios, which can weaken Shot 1 continuity.");
      }
    }

    if (typeof input.intermediateFrameAspectRatio === "number" && typeof input.endFrameAspectRatio === "number") {
      const secondGap = Math.abs(input.intermediateFrameAspectRatio - input.endFrameAspectRatio);
      if (secondGap > 0.08) {
        warnings.push("Intermediate and End anchors use different aspect ratios, which can weaken Shot 2 continuity.");
      }
    }
  }

  if (input.referenceImages.length > VIDEO_SIMPLE_REFERENCE_LIMIT) {
    warnings.push("Use up to 3 reference images for the most stable provider behavior.");
  }

  const hasBackReference = input.referenceImages.some((image) => image.role === "back");
  const promptSuggestsBackView = hasAnyBackIntent(input.prompt);
  if (promptSuggestsBackView && !hasBackReference && !input.hasEndFrame) {
    warnings.push("Back-view prompts are more reliable with a Back Reference or an end frame.");
  }

  const hasAnchorDetails = Boolean(summarizeGarmentAnchors(input.garmentAnchors));
  if (hasAnchorDetails && (input.motionPreset === "camera-orbit" || input.motionPreset === "turn-and-settle")) {
    warnings.push("Detailed garment anchors pair best with controlled movement; consider Slow pivot or Back reveal hold if continuity drifts.");
  }

  return warnings;
}
