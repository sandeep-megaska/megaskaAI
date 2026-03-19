import {
  getCameraMotionLabel,
  getMotionPresetCategory,
  getMotionPresetLabel,
  getSubjectMotionLabel,
  type VideoCameraMotion,
  type VideoDurationSeconds,
  type VideoMode,
  type VideoMotionPreset,
  type VideoSubjectMotion,
} from "@/lib/video/promptBuilder";

export type BuildMegaskaFidelityPromptInput = {
  videoMode: VideoMode;
  motionPreset: VideoMotionPreset;
  durationSeconds: VideoDurationSeconds;
  cameraMotion: VideoCameraMotion;
  subjectMotion: VideoSubjectMotion;
  strictMegaskaFidelity: boolean;
  userPrompt?: string | null;
};

const SAFE_MOTION_GUIDANCE: Record<VideoMotionPreset, string> = {
  "subtle-breathing": "Allow only natural breathing micro-movement.",
  "slow-camera-push": "Keep subject nearly still; apply very slow push-in.",
  "gentle-pan": "Keep subject nearly still; apply gentle pan.",
  "hair-movement": "Only slight natural hair movement from soft airflow.",
  "fabric-breeze": "Only slight breeze movement on loose fabric edges.",
  "minimal-editorial-motion": "Only restrained editorial micro-motion with stable framing.",
  "walk-turn": "Large body motion is high-risk; keep minimal unless explicitly requested.",
  "lifestyle-motion": "Lifestyle movement is high-risk; keep controlled and limited.",
  "scene-transformation": "Scene transformation is high-risk; do not change location unless explicitly requested.",
};

export function buildMegaskaFidelityPrompt(input: BuildMegaskaFidelityPromptInput) {
  const category = getMotionPresetCategory(input.motionPreset);

  if (input.videoMode === "frame-based-megaska") {
    const shortLines: string[] = [
      "Megaska frame-based motion.",
      "Preserve same model identity, exact swimsuit, and same environment.",
      "Use provided start/end frames as hard anchors.",
      `${getMotionPresetLabel(input.motionPreset)}.`,
      `Camera: ${getCameraMotionLabel(input.cameraMotion)}.`,
      `Subject: ${getSubjectMotionLabel(input.subjectMotion)}.`,
      `Duration ${input.durationSeconds}s.`,
    ];

    if (input.strictMegaskaFidelity) {
      shortLines.push("Strict fidelity on. No redesign, no scene change, no wardrobe drift.");
    }

    if (input.userPrompt?.trim()) {
      shortLines.push(`Instruction: ${input.userPrompt.trim()}`);
    }

    return shortLines.join(" ");
  }

  const lines: string[] = [
    "Megaska Shot Animation Engine.",
    "The provided image is the FIRST FRAME and PRIMARY SOURCE OF TRUTH.",
    "Animate this exact Megaska swimwear shot; do not reinterpret a new shot.",
    "Preserve same model identity.",
    "Preserve exact same swimsuit identity.",
    "Preserve garment structure: silhouette, neckline, seam/panel layout, trim placement, print/colorway.",
    "Preserve same environment and background.",
    "Preserve same composition and framing unless camera motion is explicitly requested.",
    "Do not replace model, swimsuit, or location.",
    "Do not redesign or restyle garment.",
    `Duration: ${input.durationSeconds}s.`,
    `Motion preset: ${getMotionPresetLabel(input.motionPreset)} (${category}). ${SAFE_MOTION_GUIDANCE[input.motionPreset]}`,
    `Camera motion: ${getCameraMotionLabel(input.cameraMotion)}.`,
    `Subject motion: ${getSubjectMotionLabel(input.subjectMotion)}.`,
  ];

  if (input.strictMegaskaFidelity) {
    lines.push("Strict Megaska Fidelity: ON. Subtle motion only; prioritize anchor preservation over creativity.");
  }

  if (input.videoMode === "creative-reinterpretation") {
    lines.push("Creative reinterpretation mode: still preserve model, garment, and scene continuity as much as possible.");
  }

  if (input.userPrompt?.trim()) {
    lines.push(`User notes: ${input.userPrompt.trim()}`);
  }

  lines.push("Target result: the original Megaska image has come to life.");

  return lines.join("\n");
}
