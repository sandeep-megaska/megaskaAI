export type StagedImageAsset = {
  id: string;
  url: string;
  prompt: string;
  createdAt: string;
};

const STORAGE_KEYS = {
  imageReferences: "megaska:image:reference-tray:v1",
  videoAnchors: "megaska:video:anchor-tray:v1",
  videoIncoming: "megaska:video:incoming-from-image:v1",
} as const;

type StorageBucket = keyof typeof STORAGE_KEYS;

const MAX_ITEMS = 24;

function readBucket(bucket: StorageBucket): StagedImageAsset[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEYS[bucket]);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is StagedImageAsset => {
        return Boolean(
          item &&
            typeof item.id === "string" &&
            typeof item.url === "string" &&
            typeof item.prompt === "string" &&
            typeof item.createdAt === "string",
        );
      })
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function writeBucket(bucket: StorageBucket, assets: StagedImageAsset[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEYS[bucket], JSON.stringify(assets.slice(0, MAX_ITEMS)));
}

function upsertAsset(current: StagedImageAsset[], asset: StagedImageAsset) {
  const deduped = [asset, ...current.filter((item) => item.id !== asset.id && item.url !== asset.url)];
  return deduped.slice(0, MAX_ITEMS);
}

export function getStagedImageReferences() {
  return readBucket("imageReferences");
}

export function stageImageReference(asset: StagedImageAsset) {
  const next = upsertAsset(readBucket("imageReferences"), asset);
  writeBucket("imageReferences", next);
  return next;
}

export function removeStagedImageReference(assetId: string) {
  const next = readBucket("imageReferences").filter((item) => item.id !== assetId);
  writeBucket("imageReferences", next);
  return next;
}

export function clearStagedImageReferences() {
  writeBucket("imageReferences", []);
}

export function getStagedVideoAnchors() {
  return readBucket("videoAnchors");
}

export function stageVideoAnchorCandidate(asset: StagedImageAsset) {
  const next = upsertAsset(readBucket("videoAnchors"), asset);
  writeBucket("videoAnchors", next);
  return next;
}

export function clearStagedVideoAnchors() {
  writeBucket("videoAnchors", []);
}

export function getIncomingVideoAssets() {
  return readBucket("videoIncoming");
}

export function sendAssetToVideoProject(asset: StagedImageAsset) {
  const next = upsertAsset(readBucket("videoIncoming"), asset);
  writeBucket("videoIncoming", next);
  return next;
}

export function removeIncomingVideoAsset(assetId: string) {
  const next = readBucket("videoIncoming").filter((item) => item.id !== assetId);
  writeBucket("videoIncoming", next);
  return next;
}

export function clearIncomingVideoAssets() {
  writeBucket("videoIncoming", []);
}
