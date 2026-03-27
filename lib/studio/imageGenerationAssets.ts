import type { SupabaseClient } from "@supabase/supabase-js";

export type ImageGenerationAsset = {
  id: string;
  prompt: string | null;
  asset_url: string | null;
  url: string | null;
  created_at?: string | null;
};

type LoadImageGenerationAssetsOptions = {
  queryLimit?: number;
  maxResults?: number;
};

function normalizeAssetUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return value.trim();
  }
}

function pickAssetUrl(item: ImageGenerationAsset): string | null {
  const url = item.asset_url?.trim() || item.url?.trim() || "";
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

export async function loadDistinctImageGenerationAssets(
  supabase: SupabaseClient,
  options: LoadImageGenerationAssetsOptions = {},
): Promise<ImageGenerationAsset[]> {
  const queryLimit = options.queryLimit ?? 160;
  const maxResults = options.maxResults ?? 80;

  const { data, error } = await supabase
    .from("generations")
    .select("id,prompt,asset_url,url,created_at,generation_kind")
    .eq("generation_kind", "image")
    .order("created_at", { ascending: false })
    .limit(queryLimit);

  if (error) {
    console.warn("[image-assets] failed to load image assets", { message: error.message });
    return [];
  }

  const rawItems = (data ?? []) as ImageGenerationAsset[];
  const seenGenerationIds = new Set<string>();
  const seenUrls = new Set<string>();

  const deduped: ImageGenerationAsset[] = [];
  for (const item of rawItems) {
    const usableUrl = pickAssetUrl(item);
    if (!usableUrl) continue;

    const normalizedUrl = normalizeAssetUrl(usableUrl);
    if (seenGenerationIds.has(item.id) || seenUrls.has(normalizedUrl)) continue;

    seenGenerationIds.add(item.id);
    seenUrls.add(normalizedUrl);
    deduped.push({ ...item, asset_url: item.asset_url ?? usableUrl, url: item.url ?? usableUrl });

    if (deduped.length >= maxResults) break;
  }

  console.info("[image-assets] picker results", {
    rawResultsCount: rawItems.length,
    dedupedResultsCount: deduped.length,
    queryLimit,
    maxResults,
  });

  return deduped;
}
