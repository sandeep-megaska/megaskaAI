export const VIDEO_MOTION_PRESETS = [
  "subtle-motion",
  "walk-turn",
  "camera-motion",
  "lifestyle-motion",
  "detail-motion",
] as const;

export const VIDEO_DURATIONS = [8] as const;

export const VIDEO_STYLES = ["realistic", "editorial", "ad-style"] as const;

export const VIDEO_MOTION_STRENGTHS = ["subtle", "moderate", "dynamic"] as const;

export type VideoMotionPreset = (typeof VIDEO_MOTION_PRESETS)[number];
export type VideoDurationSeconds = (typeof VIDEO_DURATIONS)[number];
export type VideoStyle = (typeof VIDEO_STYLES)[number];
export type VideoMotionStrength = (typeof VIDEO_MOTION_STRENGTHS)[number];

export type BuildVideoPromptInput = {
  masterImageUrl: string;
  motionPreset: VideoMotionPreset;
  durationSeconds: VideoDurationSeconds;
  style: VideoStyle;
  motionStrength: VideoMotionStrength;
  strictGarmentLock: boolean;
  userPrompt?: string | null;
};

const MOTION_PRESET_INSTRUCTIONS: Record<VideoMotionPreset, string> = {
  "subtle-motion": "Apply minimal movement with small breathing, hair drift, and natural micro-shifts while keeping framing stable.",
  "walk-turn": "Create a clean runway-style walk with one elegant turn, then settle into a confident end pose.",
  "camera-motion": "Keep subject motion controlled while introducing premium camera dolly and parallax movement.",
  "lifestyle-motion": "Generate polished lifestyle motion with organic body movement and brand-safe premium pacing.",
  "detail-motion": "Focus on garment detail reveals with close framing and controlled motion that highlights material and construction.",
};

const STYLE_INSTRUCTIONS: Record<VideoStyle, string> = {
  realistic: "Use realistic lighting, believable physics, and natural human movement.",
  editorial: "Use editorial art direction with fashion-forward posing and premium magazine style pacing.",
  "ad-style": "Use polished ad-style motion language optimized for conversion-focused social and PDP usage.",
};

const MOTION_STRENGTH_INSTRUCTIONS: Record<VideoMotionStrength, string> = {
  subtle: "Keep motion amplitude low and smooth.",
  moderate: "Use noticeable but controlled motion.",
  dynamic: "Use expressive, energetic motion while preserving product readability.",
};

const STRICT_GARMENT_LOCK_RULES = [
  "Preserve exact garment identity from the reference image.",
  "Do not change garment structure, silhouette, print, logos, trims, or colorway.",
  "Maintain apparel fidelity across all frames and motion phases.",
];

export function getMotionPresetLabel(preset: VideoMotionPreset) {
  switch (preset) {
    case "subtle-motion":
      return "Subtle Motion";
    case "walk-turn":
      return "Walk / Turn";
    case "camera-motion":
      return "Camera Motion";
    case "lifestyle-motion":
      return "Lifestyle Motion";
    case "detail-motion":
      return "Detail Motion";
  }
}

export function getStyleLabel(style: VideoStyle) {
  switch (style) {
    case "realistic":
      return "Realistic";
    case "editorial":
      return "Editorial";
    case "ad-style":
      return "Ad-style";
  }
}

export function getMotionStrengthLabel(strength: VideoMotionStrength) {
  switch (strength) {
    case "subtle":
      return "Subtle";
    case "moderate":
      return "Moderate";
    case "dynamic":
      return "Dynamic";
  }
}

export function buildVideoPrompt(input: BuildVideoPromptInput) {
  const sections: string[] = [
    "Generate a premium fashion apparel video from the provided master image reference.",
    "Reference image is the source of truth for garment and subject continuity.",
    `Target duration: ${input.durationSeconds} seconds.`,
    `Motion preset: ${getMotionPresetLabel(input.motionPreset)}. ${MOTION_PRESET_INSTRUCTIONS[input.motionPreset]}`,
    `Style direction: ${getStyleLabel(input.style)}. ${STYLE_INSTRUCTIONS[input.style]}`,
    `Motion strength: ${getMotionStrengthLabel(input.motionStrength)}. ${MOTION_STRENGTH_INSTRUCTIONS[input.motionStrength]}`,
  ];

  if (input.strictGarmentLock) {
    sections.push(`Strict Garment Lock: ON. ${STRICT_GARMENT_LOCK_RULES.join(" ")}`);
  } else {
    sections.push("Strict Garment Lock: OFF. Keep garment highly consistent with the reference image.");
  }

  if (input.userPrompt?.trim()) {
    sections.push(`Creative notes: ${input.userPrompt.trim()}`);
  }

  sections.push("Output one cohesive single-shot clip with no garment substitutions.");

  return sections.join("\n\n");
}
