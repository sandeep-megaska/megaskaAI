export const VIDEO_MOTION_PRESETS = [
  "subtle-breathing",
  "slow-camera-push",
  "gentle-pan",
  "hair-movement",
  "fabric-breeze",
  "minimal-editorial-motion",
  "walk-turn",
  "lifestyle-motion",
  "scene-transformation",
] as const;

export const VIDEO_DURATIONS = [8] as const;

export const VIDEO_STYLES = ["realistic", "editorial", "ad-style"] as const;

export const VIDEO_MOTION_STRENGTHS = ["subtle", "moderate", "dynamic"] as const;

export const VIDEO_MODES = ["animate-existing-shot", "creative-reinterpretation"] as const;
export const VIDEO_CAMERA_MOTIONS = ["none", "push", "pan"] as const;
export const VIDEO_SUBJECT_MOTIONS = ["none", "subtle", "moderate"] as const;

export type VideoMotionPreset = (typeof VIDEO_MOTION_PRESETS)[number];
export type VideoDurationSeconds = (typeof VIDEO_DURATIONS)[number];
export type VideoStyle = (typeof VIDEO_STYLES)[number];
export type VideoMotionStrength = (typeof VIDEO_MOTION_STRENGTHS)[number];
export type VideoMode = (typeof VIDEO_MODES)[number];
export type VideoCameraMotion = (typeof VIDEO_CAMERA_MOTIONS)[number];
export type VideoSubjectMotion = (typeof VIDEO_SUBJECT_MOTIONS)[number];
export type VideoMotionPresetCategory = "safe" | "experimental";

export type BuildVideoPromptInput = {
  masterImageUrl: string;
  videoMode: VideoMode;
  motionPreset: VideoMotionPreset;
  durationSeconds: VideoDurationSeconds;
  style: VideoStyle;
  motionStrength: VideoMotionStrength;
  cameraMotion: VideoCameraMotion;
  subjectMotion: VideoSubjectMotion;
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
  "walk-turn": "Experimental motion: attempt a controlled walk and turn while maintaining identity, garment, and scene continuity.",
  "lifestyle-motion": "Experimental motion: add gentle lifestyle body motion, but avoid replacing the subject, garment, or environment.",
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

const CAMERA_MOTION_INSTRUCTIONS: Record<VideoCameraMotion, string> = {
  none: "Camera motion: none. Keep framing and camera position stable.",
  push: "Camera motion: push. Use a slow controlled push-in while preserving composition.",
  pan: "Camera motion: pan. Use a gentle pan while preserving shot structure.",
};

const SUBJECT_MOTION_INSTRUCTIONS: Record<VideoSubjectMotion, string> = {
  none: "Subject motion: none. Keep the model pose nearly static with only natural micro-movement.",
  subtle: "Subject motion: subtle. Allow minimal natural body motion while preserving pose identity.",
  moderate: "Subject motion: moderate. Allow noticeable but controlled subject motion while preserving identity and garment fidelity.",
};

const STRICT_GARMENT_LOCK_RULES = [
  "Preserve exact garment identity from the reference image.",
  "Do not change garment structure, silhouette, print, logos, trims, seams, trim placement, or colorway.",
  "Maintain apparel fidelity across all frames and motion phases.",
];

const STRICT_ANIMATE_SHOT_RULES = [
  "Treat the provided master image as first frame and primary anchor.",
  "Animate this exact shot. Do not reinterpret into a new composition.",
  "Preserve the same person identity exactly; do not replace the model.",
  "Preserve the same garment identity exactly including print, colorway, silhouette, seams, trims, and fit details.",
  "Preserve the same scene and location by default.",
  "Preserve framing and composition unless explicit camera motion is requested.",
  "Do not replace the model, garment, or location.",
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
      return "Dynamic Lifestyle Motion";
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

export function getVideoModeLabel(mode: VideoMode) {
  switch (mode) {
    case "animate-existing-shot":
      return "Animate Existing Shot";
    case "creative-reinterpretation":
      return "Creative Reinterpretation (Experimental)";
  }
}

export function getCameraMotionLabel(motion: VideoCameraMotion) {
  switch (motion) {
    case "none":
      return "None";
    case "push":
      return "Push";
    case "pan":
      return "Pan";
  }
}

export function getSubjectMotionLabel(motion: VideoSubjectMotion) {
  switch (motion) {
    case "none":
      return "None";
    case "subtle":
      return "Subtle";
    case "moderate":
      return "Moderate";
  }
}

export function buildVideoPrompt(input: BuildVideoPromptInput) {
  const presetCategory = getMotionPresetCategory(input.motionPreset);
  const isAnimateExistingShot = input.videoMode === "animate-existing-shot";

  const sections: string[] = [
    "Generate a premium fashion apparel image-to-video clip from the provided master image reference.",
    `Video mode: ${getVideoModeLabel(input.videoMode)}.`,
    isAnimateExistingShot
      ? "Default behavior: animate the existing shot and preserve reference fidelity."
      : "Default behavior: allow controlled creative reinterpretation while retaining core product readability.",
    `Target duration: ${input.durationSeconds} seconds.`,
    `Motion preset: ${getMotionPresetLabel(input.motionPreset)} (${presetCategory}). ${MOTION_PRESET_INSTRUCTIONS[input.motionPreset]}`,
    `Style direction: ${getStyleLabel(input.style)}. ${STYLE_INSTRUCTIONS[input.style]}`,
    `Motion strength: ${getMotionStrengthLabel(input.motionStrength)}. ${MOTION_STRENGTH_INSTRUCTIONS[input.motionStrength]}`,
    CAMERA_MOTION_INSTRUCTIONS[input.cameraMotion],
    SUBJECT_MOTION_INSTRUCTIONS[input.subjectMotion],
  ];

  if (isAnimateExistingShot || input.strictAnchor) {
    sections.push(`Anchor preservation block: ${STRICT_ANIMATE_SHOT_RULES.join(" ")}`);
  }

  if (input.strictAnchor) {
    sections.push("Strict Anchor: ON. Enforce maximum first-frame and composition preservation.");
  } else {
    sections.push("Strict Anchor: OFF. Still preserve identity, garment, and core scene unless user notes request change.");
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
    isAnimateExistingShot
      ? "Output one cohesive single-shot clip that keeps the same model identity, same garment identity, and same scene unless explicit user notes override."
      : "Output one cohesive single-shot clip that may reinterpret motion style, while preserving identifiable garment and subject continuity.",
  );

  return sections.join("\n\n");
}
