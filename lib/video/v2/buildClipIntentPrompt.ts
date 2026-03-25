export type ClipIntentPromptInput = {
  clip_goal?: string | null;
  scene_policy?: string | null;
  motion_template?: string | null;
  fidelity_priority?: string | null;
  motion_prompt?: string | null;
};

function clean(value?: string | null) {
  return value?.trim() ?? "";
}

function normalizeFidelityPriority(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "maximum-fidelity" || normalized === "identity-lock" || normalized === "balanced") return normalized;
  return "maximum-fidelity";
}

export function buildClipIntentPrompt(input: ClipIntentPromptInput) {
  const clipGoal = clean(input.clip_goal) || clean(input.motion_prompt) || "Create a short product-focused motion clip.";
  const scenePolicy = clean(input.scene_policy) || "Keep scene composition stable and continuity-safe.";
  const motionTemplate = clean(input.motion_template) || "Use subtle controlled subject motion with gentle camera behavior.";
  const fidelityPriority = normalizeFidelityPriority(clean(input.fidelity_priority) || "maximum-fidelity");

  const fidelityLine =
    fidelityPriority === "identity-lock"
      ? "Fidelity priority: lock facial identity, garment shape, and print placement above all style changes."
      : fidelityPriority === "balanced"
        ? "Fidelity priority: preserve identity and garment details while allowing mild cinematic motion."
        : "Fidelity priority: maximum-fidelity preservation for identity, garment fit, and texture consistency.";

  const directorPrompt = [
    `Clip goal: ${clipGoal}`,
    `Scene policy: ${scenePolicy}`,
    `Motion template: ${motionTemplate}`,
    fidelityLine,
    "Keep motion concise, stable, and anchor-consistent.",
  ].join("\n");

  const fallbackPrompt = [
    "Fallback mode: reduce motion intensity and camera movement.",
    "Preserve identity, garment drape, logos, and scene continuity.",
    `Primary goal: ${clipGoal}`,
  ].join("\n");

  return {
    directorPrompt,
    fallbackPrompt,
  };
}
