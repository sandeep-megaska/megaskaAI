import type { V2Mode } from "@/lib/video/v2/types";

export type FidelityTier = "low" | "medium" | "high";
export type MotionBucket = "minimal" | "moderate" | "dynamic";
export type DependencyLevel = "low" | "medium" | "high";
export type PlannerDecision = "proceed" | "warn" | "block";

export type FidelityPlannerItem = {
  role: string;
  generation_id: string | null;
  source_kind: string;
};

export type FidelityPlannerInput = {
  clipIntentId: string;
  motionPrompt: string;
  workingPackId: string;
  items: FidelityPlannerItem[];
};

export type FidelityPlan = {
  clip_intent_id: string;
  working_pack_id: string;
  fidelity_tier: FidelityTier;
  motion_complexity: MotionBucket;
  view_dependency: DependencyLevel;
  garment_risk: DependencyLevel;
  scene_risk: DependencyLevel;
  required_roles: string[];
  missing_roles: string[];
  allowed_synthesis_roles: string[];
  decision: PlannerDecision;
  reason: string;
  recommended_mode: V2Mode;
};

const SIDE_ROLES = ["three_quarter_left", "three_quarter_right"] as const;

function hasKeyword(input: string, regex: RegExp) {
  return regex.test(input);
}

export function classifyMotion(prompt: string): MotionBucket {
  const normalized = prompt.toLowerCase();
  if (hasKeyword(normalized, /\b(walk|rotate|spin|enter|jump|sit|run|dance|twirl|turn around)\b/)) return "dynamic";
  if (hasKeyword(normalized, /\b(turn|lean|reach|gesture|hand movement|pose|step|pivot)\b/)) return "moderate";
  if (hasKeyword(normalized, /\b(breath|breathing|subtle|micro|still|minimal)\b/)) return "minimal";
  return "moderate";
}

export function classifyViewDependency(prompt: string): DependencyLevel {
  const normalized = prompt.toLowerCase();
  if (hasKeyword(normalized, /\b(back view|from behind|360|full body|around|rear|back)\b/)) return "high";
  if (hasKeyword(normalized, /\b(three quarter|side|partial turn|slight turn|rotation|rotate)\b/)) return "medium";
  return "low";
}

export function classifyGarmentRisk(prompt: string): DependencyLevel {
  const normalized = prompt.toLowerCase();
  if (hasKeyword(normalized, /\b(rotation|rotate|spin|fabric|flowing|drape|pose|bend|water|splash|wet)\b/)) return "high";
  if (hasKeyword(normalized, /\b(turn|lean|walk|movement|sit)\b/)) return "medium";
  return "low";
}

export function classifySceneRisk(prompt: string): DependencyLevel {
  const normalized = prompt.toLowerCase();
  if (hasKeyword(normalized, /\b(enter|exit|crowd|street|environment|water|splash|rain|move through)\b/)) return "high";
  if (hasKeyword(normalized, /\b(step|walk|shift|camera move|pan)\b/)) return "medium";
  return "low";
}

export function computeFidelityTier(input: {
  motion: MotionBucket;
  viewDependency: DependencyLevel;
  garmentRisk: DependencyLevel;
  sceneRisk: DependencyLevel;
}): FidelityTier {
  if (input.motion === "dynamic" || input.viewDependency === "high" || input.garmentRisk === "high" || input.sceneRisk === "high") {
    return "high";
  }
  if (input.motion === "moderate" || input.viewDependency === "medium" || input.garmentRisk === "medium" || input.sceneRisk === "medium") {
    return "medium";
  }
  return "low";
}

function hasRole(items: FidelityPlannerItem[], role: string) {
  return items.some((item) => item.role === role && Boolean(item.generation_id));
}

function hasRealRole(items: FidelityPlannerItem[], role: string) {
  return items.some((item) => item.role === role && Boolean(item.generation_id) && item.source_kind !== "synthesized");
}

function isSynthesizedRole(items: FidelityPlannerItem[], role: string) {
  return items.some((item) => item.role === role && Boolean(item.generation_id) && item.source_kind === "synthesized");
}

function resolveRequiredRoles(tier: FidelityTier): string[] {
  if (tier === "low") return ["front", "fit_anchor"];
  if (tier === "medium") return ["front", "fit_anchor", "three_quarter_side"];
  return ["front", "back", "three_quarter_left", "three_quarter_right", "fit_anchor"];
}

function detectMissingRoles(tier: FidelityTier, items: FidelityPlannerItem[]): string[] {
  if (tier === "medium") {
    const missing = ["front", "fit_anchor"].filter((role) => !hasRole(items, role));
    const hasRealSide = SIDE_ROLES.some((role) => hasRealRole(items, role));
    if (!hasRealSide) missing.push("three_quarter_side");
    return missing;
  }
  return resolveRequiredRoles(tier).filter((role) => !hasRole(items, role));
}

function allowedSynthesisRolesForTier(tier: FidelityTier): string[] {
  if (tier === "low") return [];
  if (tier === "medium") return [...SIDE_ROLES];
  return [...SIDE_ROLES, "detail", "context"];
}

function recommendMode(tier: FidelityTier, items: FidelityPlannerItem[]): V2Mode {
  const hasFrames = hasRole(items, "start_frame") && hasRole(items, "end_frame");
  if (tier === "high" && hasFrames) return "frames_to_video";
  return "ingredients_to_video";
}

function decidePlan(tier: FidelityTier, missingRoles: string[], items: FidelityPlannerItem[]): { decision: PlannerDecision; reason: string } {
  if (tier === "high" && missingRoles.includes("back")) {
    return { decision: "block", reason: "Back anchor required for high-fidelity rotation or pose-change motion." };
  }

  if (missingRoles.length > 0) {
    return {
      decision: "block",
      reason: `Missing required anchor roles: ${missingRoles.join(", ")}.`,
    };
  }

  const sideSynthesized = SIDE_ROLES.some((role) => isSynthesizedRole(items, role));
  if (tier === "medium" && sideSynthesized) {
    return {
      decision: "warn",
      reason: "Side-view anchor is synthesized; movement should stay controlled to preserve fidelity.",
    };
  }

  return { decision: "proceed", reason: "Anchor coverage is sufficient for requested creative motion." };
}

export function computeFidelityPlan(input: FidelityPlannerInput): FidelityPlan {
  const motion = classifyMotion(input.motionPrompt);
  const viewDependency = classifyViewDependency(input.motionPrompt);
  const garmentRisk = classifyGarmentRisk(input.motionPrompt);
  const sceneRisk = classifySceneRisk(input.motionPrompt);

  const tier = computeFidelityTier({
    motion,
    viewDependency,
    garmentRisk,
    sceneRisk,
  });

  const missingRoles = detectMissingRoles(tier, input.items);
  const decision = decidePlan(tier, missingRoles, input.items);

  return {
    clip_intent_id: input.clipIntentId,
    working_pack_id: input.workingPackId,
    fidelity_tier: tier,
    motion_complexity: motion,
    view_dependency: viewDependency,
    garment_risk: garmentRisk,
    scene_risk: sceneRisk,
    required_roles: resolveRequiredRoles(tier),
    missing_roles: missingRoles,
    allowed_synthesis_roles: allowedSynthesisRolesForTier(tier),
    decision: decision.decision,
    reason: decision.reason,
    recommended_mode: recommendMode(tier, input.items),
  };
}
