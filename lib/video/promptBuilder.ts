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

export const VIDEO_SAFE_MOTION_PRESETS = [
  "subtle-breathing",
  "slow-camera-push",
  "gentle-pan",
  "hair-movement",
  "fabric-breeze",
  "minimal-editorial-motion",
] as const;

export const VIDEO_EXPERIMENTAL_MOTION_PRESETS = [
  "walk-turn",
  "lifestyle-motion",
  "scene-transformation",
] as const;

export const VIDEO_DURATIONS = [8] as const;
export const VIDEO_STYLES = ["realistic", "editorial", "ad-style"] as const;
export const VIDEO_MOTION_STRENGTHS = ["subtle", "moderate", "dynamic"] as const;
export const VIDEO_MODES = ["animate-master-shot", "creative-reinterpretation"] as const;
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
    case "animate-master-shot":
      return "Animate Master Shot (Megaska Recommended)";
    case "creative-reinterpretation":
      return "Creative Reinterpretation (Experimental)";
  }
}

export function getCameraMotionLabel(motion: VideoCameraMotion) {
  switch (motion) {
    case "none":
      return "None";
    case "push":
      return "Slow Push";
    case "pan":
      return "Gentle Pan";
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
