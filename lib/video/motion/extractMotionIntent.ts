import type { MotionCategory, MotionIntent } from "@/lib/video/motion/types";

const MICRO_MOTION_KEYWORDS = ["smile", "breath", "breathing", "blink", "slight", "slightly", "expression", "head turn"];
const POSE_TRANSITION_KEYWORDS = ["turn", "turning", "front", "back", "profile", "posture shift", "rotate"];
const LIMB_MOTION_KEYWORDS = ["raise", "raising", "bend", "bending", "stretch", "gesture", "hands", "arm", "leg"];
const INTERACTION_KEYWORDS = ["wash", "washing", "open", "opening", "pick", "holding", "hold", "door", "cup", "sink", "dishes", "phone", "object"];

const OBJECT_HINTS = ["sink", "dishes", "door", "cup", "phone", "table", "chair", "book", "bag"];
const SCENE_HINTS = ["kitchen", "bathroom", "street", "studio", "beach", "park", "room"];

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function normalizeActionPhrase(text: string) {
  return text
    .replace(/the exact model in the exact garment/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitActionClauses(text: string) {
  return text
    .split(/\b(?:and then|then|and)\b/gi)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function inferMotionCategory(normalizedPrompt: string, actionCount: number): MotionCategory {
  if (actionCount > 1) return "sequence-motion";
  if (includesAny(normalizedPrompt, INTERACTION_KEYWORDS)) return "interaction-motion";
  if (includesAny(normalizedPrompt, LIMB_MOTION_KEYWORDS)) return "limb-motion";
  if (includesAny(normalizedPrompt, POSE_TRANSITION_KEYWORDS)) return "pose-transition";
  if (includesAny(normalizedPrompt, MICRO_MOTION_KEYWORDS)) return "micro-motion";
  return "pose-transition";
}

export function extractMotionIntent(prompt: string): MotionIntent {
  const normalizedPrompt = normalizeActionPhrase(prompt.toLowerCase());
  const actionClauses = splitActionClauses(normalizedPrompt);
  const primaryAction = actionClauses[0] || "subtle movement";
  const secondaryAction = actionClauses[1] || null;
  const actionCount = Math.max(1, Math.min(actionClauses.length, 2));
  const motionCategory = inferMotionCategory(normalizedPrompt, actionCount);

  const objectInteraction = OBJECT_HINTS.find((token) => normalizedPrompt.includes(token)) ?? null;
  const sceneInteraction = SCENE_HINTS.find((token) => normalizedPrompt.includes(token)) ?? null;

  const motionComplexity: MotionIntent["motionComplexity"] =
    motionCategory === "micro-motion"
      ? "low"
      : motionCategory === "sequence-motion" || motionCategory === "interaction-motion"
        ? "high"
        : "medium";

  return {
    motionCategory,
    primaryAction,
    secondaryAction,
    objectInteraction,
    sceneInteraction,
    motionComplexity,
    actionCount,
  };
}
