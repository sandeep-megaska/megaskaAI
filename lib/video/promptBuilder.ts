export const VIDEO_MOTION_PRESETS = [
  "subtle-breathing",
  "slow-camera-push",
  "gentle-pan",
  "hair-movement",
  "fabric-breeze",
  "minimal-editorial-motion",
  "walk-turn",
  "lifestyle-motion",
  "dynamic-motion",
  "scene-transformation",
] as const;

export const VIDEO_DURATIONS = [8] as const;

export const VIDEO_STYLES = ["realistic", "editorial", "ad-style"] as const;

export const VIDEO_MOTION_STRENGTHS = ["subtle", "moderate", "dynamic"] as const;

export type VideoMotionPreset = (typeof VIDEO_MOTION_PRESETS)[number];
export type VideoDurationSeconds = (typeof VIDEO_DURATIONS)[number];
export type VideoStyle = (typeof VIDEO_STYLES)[number];
export type VideoMotionStrength = (typeof VIDEO_MOTION_STRENGTHS)[number];
export type VideoMotionPresetCategory = "safe" | "experimental";

export type BuildVideoPromptInput = {
  masterImageUrl: string;
  motionPreset: VideoMotionPreset;
  durationSeconds: VideoDurationSeconds;
  style: VideoStyle;
  motionStrength: VideoMotionStrength;
  strictGarmentLock: boolean;
  strictAnchor: boolean;
  userPrompt?: string | null;
};

const MOTION_PRESET_INSTRUCTIONS: Record<VideoMotionPreset, string> = {
  "subtle-breathing":
    "Add only minimal chest and posture micro-movements, as if the subject is breathing naturally while holding the same pose.",
  "slow-camera-push":
    "Keep the subject and garment nearly static while applying a very slow camera push-in with stable framing and no scene reinterpretation.",
  "gentle-pan":
    "Use a gentle horizontal camera pan with near-static subject pose and no identity, garment, or scene changes.",
  "hair-movement":
    "Preserve pose and framing while allowing slight natural hair movement from soft ambient airflow.",
  "fabric-breeze":
    "Preserve garment structure and fit while introducing slight breeze movement in loose fabric edges only.",
  "minimal-editorial-motion":
    "Apply premium but restrained editorial micro-motion: subtle weight shift, slight head movement, and stable camera.",
  "walk-turn":
    "Experimental motion: attempt a controlled walk and turn while maintaining identity, garment, and scene continuity.",
  "lifestyle-motion":
    "Experimental motion: add gentle lifestyle body motion, but avoid replacing the subject, garment, or environment.",
  "dynamic-motion":
    "Experimental motion: allow stronger body/camera motion while still trying to preserve the same master-shot identity and styling.",
  "scene-transformation":
    "Experimental motion: scene change is only allowed if explicitly requested in user notes; otherwise preserve the original environment.",
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
  "Do not change garment structure, silhouette, print, logos, trims, seams, trim placement, or colorway.",
  "Maintain apparel fidelity across all frames and motion phases.",
];

const STRICT_ANCHOR_RULES = [
  "Treat the provided master image as the first-frame anchor and primary source of truth.",
  "Animate this exact master shot rather than reimagining it.",
  "Preserve the same person identity exactly; do not replace the model.",
  "Preserve the same garment exactly; do not replace or restyle the garment.",
  "Preserve the same environment and background by default.",
  "Preserve same frame composition and shot direction unless explicitly requested otherwise.",
  "Do not create a different scene unless explicitly requested in user notes.",
];

export function getMotionPresetLabel(preset: VideoMotionPreset) {
  switch (preset) {
    case "subtle-breathing":
      return "Subtle Breathing";
    case "slow-camera-push":
      return "Slow Camera Push";
    case "gentle-pan":
      return "Gentle Pan";
    case "hair-movement":
      return "Hair Movement";
    case "fabric-breeze":
      return "Fabric Breeze";
    case "minimal-editorial-motion":
      return "Minimal Editorial Motion";
    case "walk-turn":
      return "Walk / Turn";
    case "lifestyle-motion":
      return "Lifestyle Motion";
    case "dynamic-motion":
      return "Dynamic Motion";
    case "scene-transformation":
      return "Scene Transformation";
  }
}

export function getMotionPresetCategory(preset: VideoMotionPreset): VideoMotionPresetCategory {
  switch (preset) {
    case "subtle-breathing":
    case "slow-camera-push":
    case "gentle-pan":
    case "hair-movement":
    case "fabric-breeze":
    case "minimal-editorial-motion":
      return "safe";
    case "walk-turn":
    case "lifestyle-motion":
    case "dynamic-motion":
    case "scene-transformation":
      return "experimental";
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
  const presetCategory = getMotionPresetCategory(input.motionPreset);

  const sections: string[] = [
    "Generate a premium fashion apparel image-to-video clip from the provided master image reference.",
    "Default behavior: animate the existing shot, do not reimagine a new shot.",
    `Target duration: ${input.durationSeconds} seconds.`,
    `Motion preset: ${getMotionPresetLabel(input.motionPreset)} (${presetCategory}). ${MOTION_PRESET_INSTRUCTIONS[input.motionPreset]}`,
    `Style direction: ${getStyleLabel(input.style)}. ${STYLE_INSTRUCTIONS[input.style]}`,
    `Motion strength: ${getMotionStrengthLabel(input.motionStrength)}. ${MOTION_STRENGTH_INSTRUCTIONS[input.motionStrength]}`,
  ];

  if (input.strictAnchor) {
    sections.push(`Strict Anchor: ON. ${STRICT_ANCHOR_RULES.join(" ")}`);
  } else {
    sections.push(
      "Strict Anchor: OFF. Still preserve identity, garment, scene, and composition as much as possible unless user notes explicitly request a change.",
    );
  }

  if (input.strictGarmentLock) {
    sections.push(`Strict Garment Lock: ON. ${STRICT_GARMENT_LOCK_RULES.join(" ")}`);
  } else {
    sections.push("Strict Garment Lock: OFF. Keep garment highly consistent with the reference image.");
  }

  if (input.userPrompt?.trim()) {
    sections.push(`Creative notes: ${input.userPrompt.trim()}`);
  }

  sections.push(
    "Output one cohesive single-shot clip that keeps the same model identity, same garment identity, and same scene unless explicit user notes override.",
  );

  return sections.join("\n\n");
}
