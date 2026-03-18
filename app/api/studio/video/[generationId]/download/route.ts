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

function parseSupabaseObjectFromUri(
  uri: string,
): { bucket: string; objectPath: string; parseSource: string } | null {
  if (!uri) return null;

  if (uri.startsWith("gs://")) {
    const stripped = uri.slice("gs://".length);
    const slashIndex = stripped.indexOf("/");
    if (slashIndex <= 0 || slashIndex === stripped.length - 1) return null;

    return {
      bucket: stripped.slice(0, slashIndex),
      objectPath: stripped.slice(slashIndex + 1),
      parseSource: "gs-uri",
    };
  }

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
    .select("id,asset_url,url")
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

  const parsedObject = parseSupabaseObjectFromUri(storedUri);

  console.log("[studio/video/download] resolved stored URI", {
    generationId,
    uriFormat: classifyStoredVideoUri(storedUri),
    storedUri,
    parseSource: parsedObject?.parseSource ?? "unparsed",
    bucket: parsedObject?.bucket ?? null,
    objectPath: parsedObject?.objectPath ?? null,
  });

  if (!parsedObject) {
    return asJson(400, {
      success: false,
      error: "Stored video URI is not a supported downloadable storage URI.",
    });
  }

  const fileName = parsedObject.objectPath.split("/").pop() || `video-${generationId}.mp4`;
  const { data: signedData, error: signedError } = await supabase.storage
    .from(parsedObject.bucket)
    .createSignedUrl(parsedObject.objectPath, 60, { download: fileName });

  if (signedError || !signedData?.signedUrl) {
    console.error("[studio/video/download] signed URL generation failed", {
      generationId,
      bucket: parsedObject.bucket,
      objectPath: parsedObject.objectPath,
      error: signedError?.message ?? "Missing signed URL",
    });

    return asJson(403, {
      success: false,
      error:
        "Unable to authorize video download. Verify the server service role can read this storage object.",
    });
  }

  console.log("[studio/video/download] signed URL created", {
    generationId,
    bucket: parsedObject.bucket,
    objectPath: parsedObject.objectPath,
  });

  return NextResponse.redirect(signedData.signedUrl, { status: 302 });
}
