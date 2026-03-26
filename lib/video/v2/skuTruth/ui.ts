export type WorkingPackCandidateItem = {
  id: string;
  role: string;
  source_kind: string;
  generation_id: string | null;
  generation?: {
    id?: string | null;
    asset_url?: string | null;
    url?: string | null;
    thumbnail_url?: string | null;
  } | null;
};

export type RoleSuggestionMetadata = {
  role?: string | null;
  sourceKind?: string | null;
  prompt?: string | null;
  label?: string | null;
  tags?: string[] | null;
};

export type SkuTruthCandidateImage = {
  generationId: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  sourceKind: string;
  sourceRole: string | null;
  suggestedRole: string | null;
};

const ROLE_KEYWORDS: Array<{ keyword: string; role: string }> = [
  { keyword: "fit_anchor", role: "fit_anchor" },
  { keyword: "three_quarter_left", role: "three_quarter_left" },
  { keyword: "three_quarter_right", role: "three_quarter_right" },
  { keyword: "left_profile", role: "left_profile" },
  { keyword: "right_profile", role: "right_profile" },
  { keyword: "front", role: "front" },
  { keyword: "back", role: "back" },
  { keyword: "detail", role: "detail" },
  { keyword: "context", role: "context" },
];

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function safeRoleFromText(value: string | null | undefined): string | null {
  const normalized = normalize(value);
  if (!normalized) return null;
  const found = ROLE_KEYWORDS.find((entry) => normalized.includes(entry.keyword));
  return found?.role ?? null;
}

export function suggestRoleFromMetadata(metadata: RoleSuggestionMetadata): string | null {
  const directRole = safeRoleFromText(metadata.role);
  if (directRole) return directRole;

  const sourceHint = safeRoleFromText(metadata.sourceKind);
  if (sourceHint) return sourceHint;

  const labelHint = safeRoleFromText(metadata.label);
  if (labelHint) return labelHint;

  const promptHint = safeRoleFromText(metadata.prompt);
  if (promptHint) return promptHint;

  for (const tag of metadata.tags ?? []) {
    const tagHint = safeRoleFromText(tag);
    if (tagHint) return tagHint;
  }

  return null;
}

export function suggestRoleForCandidate(item: Pick<SkuTruthCandidateImage, "sourceRole" | "sourceKind">): string | null {
  return suggestRoleFromMetadata({
    role: item.sourceRole,
    sourceKind: item.sourceKind,
  });
}

export function buildSkuTruthCandidates(items: WorkingPackCandidateItem[]): SkuTruthCandidateImage[] {
  const unique = new Map<string, SkuTruthCandidateImage>();

  for (const item of items) {
    const generationId = item.generation_id?.trim() || item.generation?.id?.trim() || "";
    if (!generationId || unique.has(generationId)) continue;

    const imageUrl = item.generation?.asset_url ?? item.generation?.url ?? null;
    const thumbnailUrl = item.generation?.thumbnail_url ?? imageUrl;
    const sourceRole = item.role ?? null;

    const candidate: SkuTruthCandidateImage = {
      generationId,
      imageUrl,
      thumbnailUrl,
      sourceKind: item.source_kind,
      sourceRole,
      suggestedRole: suggestRoleForCandidate({ sourceRole, sourceKind: item.source_kind }),
    };

    unique.set(generationId, candidate);
  }

  return Array.from(unique.values());
}
