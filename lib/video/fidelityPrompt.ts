import {
  type MotionRiskLevel,
  type VideoDurationSeconds,
  type VideoFidelityPriority,
} from "@/lib/video/promptBuilder";

export type BuildMegaskaFidelityPromptInput = {
  durationSeconds: VideoDurationSeconds;
  fidelityPriority: VideoFidelityPriority;
  motionRiskLevel: MotionRiskLevel;
  actionPrompt: string;
  styleHint?: string | null;
};

export function buildInvariantPromptBlock() {
  return [
    "Same model identity.",
    "Same garment identity.",
    "Preserve silhouette, neckline, trim, pattern, and colorway.",
    "Preserve garment structure and proportions.",
    "Preserve core visual identity of the subject.",
  ].join(" ");
}

function getControlInstruction(fidelityPriority: VideoFidelityPriority, motionRiskLevel: MotionRiskLevel) {
  if (fidelityPriority === "maximum-fidelity") {
    return "Keep motion conservative, avoid scene transformation, and prioritize exact visual consistency.";
  }

  if (fidelityPriority === "maximum-motion") {
    return motionRiskLevel === "high"
      ? "Allow dynamic motion while retaining key identity and garment cues; drift risk is elevated."
      : "Allow stronger motion and camera movement while preserving recognizable identity and outfit.";
  }

  return "Balance motion quality and fidelity; avoid unnecessary redesign.";
}

export function buildMegaskaFidelityPrompt(input: BuildMegaskaFidelityPromptInput) {
  const blocks = [
    `[INVARIANTS] ${buildInvariantPromptBlock()}`,
    `[CONTROL] ${getControlInstruction(input.fidelityPriority, input.motionRiskLevel)}`,
    `[ACTION] ${input.actionPrompt.trim() || "Subtle natural movement while maintaining visual consistency."}`,
  ];

  if (input.styleHint?.trim()) {
    blocks.push(`[STYLE] ${input.styleHint.trim()}`);
  }

  blocks.push(`[DURATION] ${input.durationSeconds}s.`);

  return blocks.join(" ");
}
