/**
 * Verified garment views, keyed by SKU and camera role.
 *
 * The whole point of this registry is to stop the video model inventing
 * surfaces it has never seen. A garment's back, once photographed or generated
 * and approved, is stored here so every later clip can be conditioned on the
 * real thing instead of a plausible guess.
 */

export const GARMENT_VIEW_ROLES = [
  "front",
  "back",
  "left_profile",
  "right_profile",
  "three_quarter_left",
  "three_quarter_right",
  "detail",
  "fit_anchor",
  "context",
] as const;

export type GarmentViewRole = (typeof GARMENT_VIEW_ROLES)[number];

/** How a view earned its place in the library. */
export const GARMENT_VIEW_PROVENANCE = ["sku_verified_truth", "manual_verified_override"] as const;
export type GarmentViewProvenance = (typeof GARMENT_VIEW_PROVENANCE)[number];

export type GarmentViewEntry = {
  id: string;
  sku_code: string;
  role: string;
  generation_id: string;
  source_kind: GarmentViewProvenance;
  is_verified: boolean;
  label: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** A library entry resolved to something the video pipeline can actually send. */
export type ResolvedGarmentView = GarmentViewEntry & {
  role: GarmentViewRole;
  url: string;
  prompt: string | null;
};

export function isGarmentViewRole(value: unknown): value is GarmentViewRole {
  return typeof value === "string" && (GARMENT_VIEW_ROLES as readonly string[]).includes(value);
}

/** Human labels, used wherever a role is shown to a seller. */
export const GARMENT_ROLE_LABELS: Record<GarmentViewRole, string> = {
  front: "Front",
  back: "Back",
  left_profile: "Left profile",
  right_profile: "Right profile",
  three_quarter_left: "3/4 left",
  three_quarter_right: "3/4 right",
  detail: "Detail",
  fit_anchor: "Fit anchor",
  context: "Context",
};

/**
 * Angle of each orientation role in degrees, measured from a front-facing
 * camera turning towards the model's left. Used to measure how far a clip must
 * travel without a real reference — the gap where garment detail gets invented.
 *
 * `detail`, `fit_anchor` and `context` are absent because they describe framing
 * rather than orientation.
 */
export const ROLE_ANGLES: Partial<Record<GarmentViewRole, number>> = {
  front: 0,
  three_quarter_left: 45,
  left_profile: 90,
  back: 180,
  right_profile: 270,
  three_quarter_right: 315,
};

/** Orientation roles, ordered as a camera would travel from front to back. */
export const ROTATION_ROLE_ORDER: GarmentViewRole[] = [
  "front",
  "three_quarter_left",
  "left_profile",
  "back",
  "right_profile",
  "three_quarter_right",
];

/** Shortest angular distance between two orientations, in degrees (0-180). */
export function angularGap(from: GarmentViewRole, to: GarmentViewRole): number | null {
  const a = ROLE_ANGLES[from];
  const b = ROLE_ANGLES[to];
  if (a === undefined || b === undefined) return null;
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}
