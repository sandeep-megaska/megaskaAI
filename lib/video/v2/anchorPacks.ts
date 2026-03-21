import {
  type AnchorPack,
  type AnchorPackItem,
  type AnchorPackItemRole,
  type AnchorPackType,
  type PackReadinessReport,
  type AnchorRiskLevel,
  type ModeSuitability,
  type V2Mode,
} from "@/lib/video/v2/types";

const REQUIRED_ROLES_BY_PACK_TYPE: Record<AnchorPackType, AnchorPackItemRole[]> = {
  identity: ["front", "three_quarter_left", "three_quarter_right"],
  garment: ["front", "back", "detail"],
  scene: ["context"],
  hybrid: ["front", "fit_anchor", "start_frame"],
};

const HIGH_STABILITY_THRESHOLD = 0.7;
const READY_STABILITY_THRESHOLD = 0.65;

export function computeItemStabilityScore(item: Partial<AnchorPackItem>) {
  const presentSignatures = [
    item.camera_signature,
    item.lighting_signature,
    item.pose_signature,
    item.garment_signature,
    item.scene_signature,
  ].filter((value) => Boolean(value?.trim())).length;

  return Number((presentSignatures / 5).toFixed(4));
}

// Megaska AI Studio V2: aggregate score weights signature quality and required-role coverage.
export function computePackStability(input: { packType: AnchorPackType; items: Array<Partial<AnchorPackItem>> }) {
  if (!input.items.length) return 0;

  const itemAverage =
    input.items.reduce((sum, item) => sum + (item.stability_score ?? computeItemStabilityScore(item)), 0) / input.items.length;

  const requiredRoles = REQUIRED_ROLES_BY_PACK_TYPE[input.packType];
  const presentRoleCount = requiredRoles.filter((role) => input.items.some((item) => item.role === role)).length;
  const roleCoverage = requiredRoles.length ? presentRoleCount / requiredRoles.length : 0;

  return Number((itemAverage * 0.7 + roleCoverage * 0.3).toFixed(4));
}

export function isPackReady(pack: Pick<AnchorPack, "pack_type"> & { items: Array<Partial<AnchorPackItem>>; aggregateStability: number }) {
  const requiredRoles = REQUIRED_ROLES_BY_PACK_TYPE[pack.pack_type];
  const hasAllRequiredRoles = requiredRoles.every((role) => pack.items.some((item) => item.role === role));

  if (pack.pack_type === "scene" && pack.items.length < 2) {
    return false;
  }

  return hasAllRequiredRoles && pack.aggregateStability >= READY_STABILITY_THRESHOLD;
}

function deriveRiskLevel(stability: number): AnchorRiskLevel {
  if (stability < 0.45) return "high";
  if (stability < 0.7) return "medium";
  return "low";
}

function getMissingRoles(packType: AnchorPackType, roles: AnchorPackItemRole[]) {
  const required = REQUIRED_ROLES_BY_PACK_TYPE[packType];
  return required.filter((role) => !roles.includes(role));
}

function getDuplicateRoles(items: Array<Partial<AnchorPackItem>>) {
  const counts = new Map<AnchorPackItemRole, number>();
  for (const item of items) {
    if (!item.role) continue;
    counts.set(item.role, (counts.get(item.role) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([role]) => role);
}

export function computeModeSuitability(input: {
  packType: AnchorPackType;
  itemCount: number;
  roles: AnchorPackItemRole[];
  aggregateStabilityScore: number;
  priorValidatedClipExists: boolean;
}): ModeSuitability[] {
  const results: ModeSuitability[] = [];

  const frameReasons: string[] = [];
  const hasStart = input.roles.includes("start_frame");
  const hasEnd = input.roles.includes("end_frame");
  if (!hasStart) frameReasons.push("Missing start_frame anchor.");
  if (!hasEnd) frameReasons.push("Missing end_frame anchor.");
  if (input.aggregateStabilityScore < HIGH_STABILITY_THRESHOLD) {
    frameReasons.push("Stability below 0.70 increases drift risk for exact end-state transitions.");
  }
  results.push({
    mode: "frames_to_video",
    level: frameReasons.length === 0 ? "good" : hasStart || hasEnd ? "partial" : "insufficient",
    reasons: frameReasons.length ? frameReasons : ["Start/end anchors available with strong stability."],
  });

  const ingredientReasons: string[] = [];
  const hasIdentityCoverage = (["front", "three_quarter_left", "three_quarter_right"] as AnchorPackItemRole[]).every((role) => input.roles.includes(role));
  const hasGarmentCoverage = (["front", "back", "detail"] as AnchorPackItemRole[]).every((role) => input.roles.includes(role));
  const hasContextCoverage = input.roles.includes("context") || input.packType === "scene";

  if (!hasIdentityCoverage) ingredientReasons.push("Identity angles are incomplete (front + left/right three-quarter required).");
  if (!hasGarmentCoverage) ingredientReasons.push("Garment anchors are incomplete (front/back/detail required).");
  if (!hasContextCoverage) ingredientReasons.push("No context anchor for scene continuity.");
  if (input.aggregateStabilityScore < 0.6) ingredientReasons.push("Aggregate stability below 0.60.");

  const ingredientScore = [hasIdentityCoverage, hasGarmentCoverage, hasContextCoverage].filter(Boolean).length;
  const ingredientLevel = ingredientReasons.length === 0 ? "good" : ingredientScore >= 2 ? "partial" : "insufficient";
  results.push({
    mode: "ingredients_to_video",
    level: ingredientLevel,
    reasons: ingredientReasons.length ? ingredientReasons : ["Identity, garment, and context coverage are sufficient."],
  });

  const sceneReasons: string[] = [];
  if (input.itemCount < 2) sceneReasons.push("At least 2 context-compatible anchors are required.");
  if (!input.priorValidatedClipExists) sceneReasons.push("No validated run context yet; scene extension is not available.");
  results.push({
    mode: "scene_extension",
    level: input.itemCount >= 2 && input.priorValidatedClipExists ? "good" : input.itemCount >= 2 ? "unavailable" : "insufficient",
    reasons: sceneReasons.length ? sceneReasons : ["Validated run context available for controlled extension."],
  });

  return results;
}

export function buildPackReadinessReport(input: {
  packType: AnchorPackType;
  items: Array<Partial<AnchorPackItem>>;
  aggregateStabilityScore: number;
  priorValidatedClipExists?: boolean;
}): PackReadinessReport {
  const roles = Array.from(new Set(input.items.map((item) => item.role).filter(Boolean) as AnchorPackItemRole[]));
  const missingRoles = getMissingRoles(input.packType, roles);
  const duplicateRoles = getDuplicateRoles(input.items);

  const warnings: string[] = [];
  if (duplicateRoles.length) warnings.push(`Duplicate roles detected: ${duplicateRoles.join(", ")}.`);
  if (input.items.some((item) => Number(item.stability_score ?? 0) < 0.45)) warnings.push("One or more anchors have low stability (<0.45).");
  if (input.packType === "scene" && input.items.length < 2) warnings.push("Scene packs need at least 2 context-compatible anchors.");

  const modeSuitability = computeModeSuitability({
    packType: input.packType,
    itemCount: input.items.length,
    roles,
    aggregateStabilityScore: input.aggregateStabilityScore,
    priorValidatedClipExists: Boolean(input.priorValidatedClipExists),
  });

  const recommendedMode =
    modeSuitability.find((entry) => entry.level === "good")?.mode ??
    modeSuitability.find((entry) => entry.level === "partial")?.mode ??
    ("ingredients_to_video" as V2Mode);

  const isReady = missingRoles.length === 0 && input.aggregateStabilityScore >= READY_STABILITY_THRESHOLD && warnings.length === 0;

  return {
    packType: input.packType,
    aggregateStabilityScore: Number(input.aggregateStabilityScore ?? 0),
    isReady,
    itemCount: input.items.length,
    presentRoles: roles,
    missingRoles,
    duplicateRoles,
    warnings,
    modeSuitability,
    recommendedMode,
    riskLevel: deriveRiskLevel(input.aggregateStabilityScore),
  };
}
