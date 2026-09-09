import { isGarmentViewRole, type GarmentViewRole } from "@/lib/garment/roles";

export type RoleSuggestionMetadata = {
  role?: string | null;
  sourceKind?: string | null;
  prompt?: string | null;
  label?: string | null;
  tags?: string[] | null;
};

/**
 * Keyword -> role, most specific first.
 *
 * Order matters: "three_quarter_left" has to be tested before a bare "left"
 * would match, and "back view" before "back", or a compound label gets filed
 * under the wrong angle.
 */
const ROLE_KEYWORDS: Array<{ keyword: string; role: GarmentViewRole }> = [
  { keyword: "fit_anchor", role: "fit_anchor" },
  { keyword: "fit anchor", role: "fit_anchor" },
  { keyword: "mid_turn_left", role: "three_quarter_left" },
  { keyword: "mid_turn_right", role: "three_quarter_right" },
  { keyword: "three_quarter_left", role: "three_quarter_left" },
  { keyword: "three_quarter_right", role: "three_quarter_right" },
  { keyword: "3/4 left", role: "three_quarter_left" },
  { keyword: "3/4 right", role: "three_quarter_right" },
  { keyword: "side_left", role: "left_profile" },
  { keyword: "side_right", role: "right_profile" },
  { keyword: "left_profile", role: "left_profile" },
  { keyword: "right_profile", role: "right_profile" },
  { keyword: "left profile", role: "left_profile" },
  { keyword: "right profile", role: "right_profile" },
  { keyword: "back view", role: "back" },
  { keyword: "rear view", role: "back" },
  { keyword: "front view", role: "front" },
  { keyword: "front", role: "front" },
  { keyword: "back", role: "back" },
  { keyword: "detail", role: "detail" },
  { keyword: "context", role: "context" },
];

function normalize(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function roleFromText(value: string | null | undefined): GarmentViewRole | null {
  const normalized = normalize(value);
  if (!normalized) return null;
  return ROLE_KEYWORDS.find((entry) => normalized.includes(entry.keyword))?.role ?? null;
}

/**
 * Best guess at which view an image shows, from whatever metadata exists.
 *
 * Only ever a suggestion. A wrong role in the garment library is worse than no
 * role, because the video pipeline would then condition a turn on the wrong
 * surface — so the UI always asks the seller to confirm.
 */
export function suggestRoleFromMetadata(metadata: RoleSuggestionMetadata): GarmentViewRole | null {
  if (isGarmentViewRole(metadata.role)) return metadata.role;

  for (const source of [metadata.role, metadata.sourceKind, metadata.label, metadata.prompt]) {
    const hint = roleFromText(source);
    if (hint) return hint;
  }

  for (const tag of metadata.tags ?? []) {
    const hint = roleFromText(tag);
    if (hint) return hint;
  }

  return null;
}
