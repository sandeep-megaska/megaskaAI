import {
  type VideoDurationSeconds,
  type VideoMode,
  type VideoMotionPreset,
} from "@/lib/video/promptBuilder";

export type BuildMegaskaFidelityPromptInput = {
  videoMode: VideoMode;
  motionPreset: VideoMotionPreset;
  durationSeconds: VideoDurationSeconds;
  strictMegaskaFidelity: boolean;
  userPrompt?: string | null;
};

const ANTI_DRIFT_BLOCK =
  "Anti-drift: no wardrobe change, outfit change, different swimsuit, logo change, trim change, pattern change, print change, colorway change, different person, face change, hairstyle change, background change, location change, framing change, redesign, or restyling.";

function getStrictMotionLine(preset: VideoMotionPreset) {
  switch (preset) {
    case "subtle-breathing":
      return "Allow slight natural breathing only.";
    case "slow-camera-push":
      return "Allow a very slow push-in only.";
    case "hair-movement":
      return "Allow slight hair movement only.";
    case "fabric-breeze":
      return "Allow slight breeze on loose fabric edges only.";
    case "gentle-pan":
      return "Allow a gentle pan only.";
    default:
      return "Allow only subtle motion.";
  }
}

export function buildAnimatedStillStrictPrompt(input: BuildMegaskaFidelityPromptInput) {
  return [
    "Animate the provided Megaska image with minimal natural motion only.",
    "Preserve the same person, swimsuit, background, framing, colors, and garment details.",
    "No reinterpretation, redesign, wardrobe change, or scene change.",
    getStrictMotionLine(input.motionPreset),
    ANTI_DRIFT_BLOCK,
  ].join(" ");
}

export function buildAnchoredShortShotPrompt(input: BuildMegaskaFidelityPromptInput) {
  const lines = [
    "Create a short Megaska transition using the provided frames as the visual basis.",
    "Preserve them as closely as possible with the same model, same garment, and same scene.",
    "Keep motion conservative and avoid reinterpretation.",
    `Target duration: ${input.durationSeconds}s.`,
    ANTI_DRIFT_BLOCK,
  ];

  if (input.userPrompt?.trim()) {
    lines.push(`Extra note: ${input.userPrompt.trim()}`);
  }

  return lines.join(" ");
}

export function buildCreativeReinterpretationPrompt(input: BuildMegaskaFidelityPromptInput) {
  const lines = [
    "Creative reinterpretation mode for Megaska.",
    `Motion preset: ${input.motionPreset}.`,
    `Target duration: ${input.durationSeconds}s.`,
  ];

  if (input.userPrompt?.trim()) {
    lines.push(`Creative direction: ${input.userPrompt.trim()}`);
  }

  return lines.join(" ");
}

export function buildMegaskaFidelityPrompt(input: BuildMegaskaFidelityPromptInput) {
  if (input.videoMode === "animated-still-strict") {
    return buildAnimatedStillStrictPrompt(input);
  }

  if (input.videoMode === "anchored-short-shot") {
    return buildAnchoredShortShotPrompt(input);
  }

  return buildCreativeReinterpretationPrompt(input);
}
