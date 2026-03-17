const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export type LoadedImageReference = {
  url: string;
  mimeType: string;
  base64Data: string;
  byteLength: number;
  role?: string;
  assetId?: string;
};

export type LoadImageReferenceResult = {
  ok: true;
  image: LoadedImageReference;
} | {
  ok: false;
  url: string;
  role?: string;
  assetId?: string;
  reason: string;
};

export async function loadImageReference(input: { url: string; role?: string; assetId?: string }): Promise<LoadImageReferenceResult> {
  try {
    const response = await fetch(input.url);
    if (!response.ok) {
      return {
        ok: false,
        url: input.url,
        role: input.role,
        assetId: input.assetId,
        reason: `fetch_failed_${response.status}`,
      };
    }

    const mimeType = response.headers.get("content-type")?.split(";")[0].toLowerCase() ?? "image/jpeg";
    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
      return {
        ok: false,
        url: input.url,
        role: input.role,
        assetId: input.assetId,
        reason: `unsupported_mime_${mimeType}`,
      };
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) {
      return {
        ok: false,
        url: input.url,
        role: input.role,
        assetId: input.assetId,
        reason: "empty_image",
      };
    }

    return {
      ok: true,
      image: {
        url: input.url,
        mimeType,
        base64Data: bytes.toString("base64"),
        byteLength: bytes.length,
        role: input.role,
        assetId: input.assetId,
      },
    };
  } catch {
    return {
      ok: false,
      url: input.url,
      role: input.role,
      assetId: input.assetId,
      reason: "fetch_exception",
    };
  }
}
