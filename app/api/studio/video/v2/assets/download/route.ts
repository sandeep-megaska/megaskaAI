import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type InputParams = {
  generationId: string | null;
  assetUrl: string | null;
  fileNameOverride: string | null;
};

function asJson(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function parseInput(request: Request): InputParams {
  const { searchParams } = new URL(request.url);
  return {
    generationId: searchParams.get("generation_id")?.trim() || null,
    assetUrl: searchParams.get("asset_url")?.trim() || null,
    fileNameOverride: searchParams.get("filename")?.trim() || null,
  };
}

function inferExtensionFromType(contentType: string | null): string {
  if (!contentType) return ".bin";
  const normalized = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (normalized.includes("image/png")) return ".png";
  if (normalized.includes("image/jpeg")) return ".jpg";
  if (normalized.includes("image/webp")) return ".webp";
  if (normalized.includes("image/gif")) return ".gif";
  if (normalized.includes("image/avif")) return ".avif";
  if (normalized.includes("video/mp4")) return ".mp4";
  if (normalized.includes("video/webm")) return ".webm";
  if (normalized.includes("video/quicktime")) return ".mov";
  return ".bin";
}

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function inferFileNameFromUrl(uri: string): string | null {
  try {
    const parsed = new URL(uri);
    const lastSegment = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
    const decoded = decodeURIComponent(lastSegment).trim();
    if (decoded) return sanitizeFileName(decoded);
    return null;
  } catch {
    return null;
  }
}

function ensureFileNameWithExtension(input: string, fallbackExtension: string): string {
  const base = sanitizeFileName(input) || "asset-download";
  if (base.includes(".")) return base;
  return `${base}${fallbackExtension}`;
}

function parseSupabaseObjectFromUri(uri: string): { bucket: string; objectPath: string } | null {
  if (!(uri.startsWith("http://") || uri.startsWith("https://"))) return null;
  try {
    const parsed = new URL(uri);
    const segments = parsed.pathname.split("/").filter(Boolean);

    const publicIndex = segments.findIndex((segment) => segment === "public");
    if (publicIndex >= 0 && segments.length > publicIndex + 2) {
      return {
        bucket: segments[publicIndex + 1],
        objectPath: decodeURIComponent(segments.slice(publicIndex + 2).join("/")),
      };
    }

    const signIndex = segments.findIndex((segment) => segment === "sign");
    if (signIndex >= 0 && segments.length > signIndex + 2) {
      return {
        bucket: segments[signIndex + 1],
        objectPath: decodeURIComponent(segments.slice(signIndex + 2).join("/")),
      };
    }

    return null;
  } catch {
    return null;
  }
}

async function resolveAssetUrl(input: InputParams): Promise<string | null> {
  if (input.assetUrl) return input.assetUrl;
  if (!input.generationId) return null;

  const supabase = getSupabaseAdminClient();
  const { data: generation, error } = await supabase
    .from("generations")
    .select("id,asset_url,url")
    .eq("id", input.generationId)
    .maybeSingle();

  if (error) {
    console.error("[studio/video/v2/assets/download] generation lookup failed", {
      generationId: input.generationId,
      error: error.message,
    });
    return null;
  }

  return String(generation?.asset_url || generation?.url || "").trim() || null;
}

async function maybeSignSupabaseStorageUrl(uri: string, filename: string): Promise<string> {
  const parsed = parseSupabaseObjectFromUri(uri);
  if (!parsed) return uri;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.objectPath, 120, { download: filename });
  if (error || !data?.signedUrl) {
    console.error("[studio/video/v2/assets/download] signed URL generation failed", {
      uri,
      bucket: parsed.bucket,
      objectPath: parsed.objectPath,
      error: error?.message ?? "Missing signed URL",
    });
    return uri;
  }

  return data.signedUrl;
}

export async function GET(request: Request) {
  const input = parseInput(request);

  if (!input.generationId && !input.assetUrl) {
    return asJson(400, { success: false, error: "Provide generation_id or asset_url." });
  }

  const resolvedAssetUrl = await resolveAssetUrl(input);
  if (!resolvedAssetUrl) {
    return asJson(404, { success: false, error: "Asset not found for download." });
  }

  if (!(resolvedAssetUrl.startsWith("http://") || resolvedAssetUrl.startsWith("https://"))) {
    return asJson(400, { success: false, error: "Only HTTP/HTTPS asset URLs are supported." });
  }

  const provisionalName =
    (input.fileNameOverride ? sanitizeFileName(input.fileNameOverride) : "") ||
    inferFileNameFromUrl(resolvedAssetUrl) ||
    (input.generationId ? `generation-${input.generationId}` : "asset-download");

  const signedOrDirectUrl = await maybeSignSupabaseStorageUrl(resolvedAssetUrl, provisionalName);
  const response = await fetch(signedOrDirectUrl, {
    headers: {
      "x-goog-api-key": process.env.GOOGLE_API_KEY ?? "",
    },
  });

  console.log("[download-api]", {
    status: response.status,
    contentType: response.headers.get("content-type"),
  });

  if (!response.ok) {
    return new Response(JSON.stringify({ error: "Download failed", status: response.status }), { status: 502 });
  }

  const contentType = response.headers.get("content-type") || "video/mp4";
  const finalFilename = ensureFileNameWithExtension(provisionalName, inferExtensionFromType(contentType));

  return new Response(response.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${finalFilename}"`,
    },
  });
}
