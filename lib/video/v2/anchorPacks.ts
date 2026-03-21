import { type AnchorPack, type AnchorPackItem, type AnchorPackType } from "@/lib/video/v2/types";

const REQUIRED_ROLES_BY_PACK_TYPE: Record<AnchorPackType, string[]> = {
  identity: ["front", "three_quarter_left", "three_quarter_right", "face_closeup"],
  garment: ["front", "back", "detail", "fit_anchor"],
  scene: ["context", "start_frame"],
  hybrid: ["front", "fit_anchor", "start_frame", "end_frame"],
};

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
  return hasAllRequiredRoles && pack.aggregateStability >= 0.65;
}
