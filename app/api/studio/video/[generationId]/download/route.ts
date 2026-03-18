import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function asJson(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function classifyStoredVideoUri(value: string) {
  if (value.startsWith("gs://")) return "gcs-gs-uri";
  if (value.startsWith("http://") || value.startsWith("https://")) {
    if (value.includes("/storage/v1/object/public/")) return "supabase-public-http";
    if (value.includes("/storage/v1/object/sign/")) return "supabase-signed-http";
    if (value.includes("/storage.googleapis.com/")) return "gcs-http";
    return "http-unknown";
  }
  if (value.startsWith("projects/") || value.startsWith("locations/")) return "provider-internal-uri";
  return "unknown-uri";
}

type StorageCandidate = {
  source: "video_meta.storage" | "asset_url" | "url";
  provider: "supabase";
  bucket: string;
  objectPath: string;
};

function parseSupabaseObjectFromUri(
  uri: string,
): { bucket: string; objectPath: string; parseSource: string } | null {
  if (!uri) return null;

  if (!(uri.startsWith("http://") || uri.startsWith("https://"))) return null;

  try {
    const parsed = new URL(uri);
    const segments = parsed.pathname.split("/").filter(Boolean);

    const publicIndex = segments.findIndex((segment) => segment === "public");
    if (publicIndex >= 0 && segments.length > publicIndex + 2) {
      return {
        bucket: segments[publicIndex + 1],
        objectPath: decodeURIComponent(segments.slice(publicIndex + 2).join("/")),
        parseSource: "supabase-public-url",
      };
    }

    const signIndex = segments.findIndex((segment) => segment === "sign");
    if (signIndex >= 0 && segments.length > signIndex + 2) {
      return {
        bucket: segments[signIndex + 1],
        objectPath: decodeURIComponent(segments.slice(signIndex + 2).join("/")),
        parseSource: "supabase-signed-url",
      };
    }

    return null;
  } catch {
    return null;
  }
}

export async function GET(_: Request, context: { params: Promise<{ generationId: string }> }) {
  const { generationId } = await context.params;
  const supabase = getSupabaseAdminClient();

  const { data: generation, error: generationError } = await supabase
    .from("generations")
    .select("id,asset_url,url,video_meta")
    .eq("id", generationId)
    .eq("generation_kind", "video")
    .maybeSingle();

  if (generationError) {
    console.error("[studio/video/download] generation lookup failed", {
      generationId,
      error: generationError.message,
    });
    return asJson(500, { success: false, error: "Failed to fetch video generation." });
  }

  if (!generation) {
    return asJson(404, { success: false, error: "Video generation not found." });
  }

  const storedUri = String(generation.asset_url || generation.url || "").trim();
  if (!storedUri) {
    return asJson(400, { success: false, error: "No stored video URI found for generation." });
  }

  const uriFormat = classifyStoredVideoUri(storedUri);
  const videoMeta = generation.video_meta && typeof generation.video_meta === "object" ? generation.video_meta : null;
  const metaStorage = videoMeta && "storage" in videoMeta ? (videoMeta.storage as Record<string, unknown>) : null;

  let candidate: StorageCandidate | null = null;

  if (
    metaStorage?.provider === "supabase" &&
    typeof metaStorage.bucket === "string" &&
    typeof metaStorage.objectPath === "string" &&
    metaStorage.bucket.trim() &&
    metaStorage.objectPath.trim()
  ) {
    candidate = {
      source: "video_meta.storage",
      provider: "supabase",
      bucket: metaStorage.bucket.trim(),
      objectPath: metaStorage.objectPath.trim(),
    };
  } else {
    const parsedFromAsset = parseSupabaseObjectFromUri(String(generation.asset_url || "").trim());
    if (parsedFromAsset) {
      candidate = {
        source: "asset_url",
        provider: "supabase",
        bucket: parsedFromAsset.bucket,
        objectPath: parsedFromAsset.objectPath,
      };
    } else {
      const parsedFromUrl = parseSupabaseObjectFromUri(String(generation.url || "").trim());
      if (parsedFromUrl) {
        candidate = {
          source: "url",
          provider: "supabase",
          bucket: parsedFromUrl.bucket,
          objectPath: parsedFromUrl.objectPath,
        };
      }
    }
  }

  console.log("[studio/video/download] resolved stored URI", {
    generationId,
    uriFormat,
    storedUri,
    canonicalSource: candidate?.source ?? "none",
    canonicalProvider: candidate?.provider ?? null,
    canonicalBucket: candidate?.bucket ?? null,
    canonicalObjectPath: candidate?.objectPath ?? null,
    signerProvider: candidate?.provider ?? "none",
  });

  if (!candidate) {
    console.error("[studio/video/download] unsupported URI for download signing", {
      generationId,
      storedUri,
      uriFormat,
      failureReason: "no-canonical-app-owned-supabase-object",
    });
    return asJson(400, {
      success: false,
      error:
        "Stored video URI is not an app-owned Supabase storage object. Re-generate to create a canonical downloadable copy.",
    });
  }

  const fileName = candidate.objectPath.split("/").pop() || `video-${generationId}.mp4`;
  const { data: signedData, error: signedError } = await supabase.storage
    .from(candidate.bucket)
    .createSignedUrl(candidate.objectPath, 60, { download: fileName });

  if (signedError || !signedData?.signedUrl) {
    console.error("[studio/video/download] signed URL generation failed", {
      generationId,
      bucket: candidate.bucket,
      objectPath: candidate.objectPath,
      signerProvider: "supabase",
      error: signedError?.message ?? "Missing signed URL",
      failureReason: "supabase-signing-error",
    });

    return asJson(403, {
      success: false,
      error:
        "Unable to authorize video download. Verify the server service role can read this storage object.",
    });
  }

  console.log("[studio/video/download] signed URL created", {
    generationId,
    bucket: candidate.bucket,
    objectPath: candidate.objectPath,
    signerProvider: "supabase",
  });

  return NextResponse.redirect(signedData.signedUrl, { status: 302 });
}
