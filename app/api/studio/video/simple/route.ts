import { NextResponse } from "next/server";
import { findBackendById, getDefaultBackendForType } from "@/lib/ai-backends";
import { runVeoVideo } from "@/lib/video/adapters/runVeoVideo";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { type StudioAspectRatio } from "@/lib/studio/aspectRatios";

type SimpleVideoGeneratePayload = {
  prompt?: string;
  duration_seconds?: number;
  aspect_ratio?: StudioAspectRatio;
  first_frame_url?: string | null;
  last_frame_url?: string | null;
  ai_backend_id?: string;
};

const SUPPORTED_DURATIONS = [4, 6, 8] as const;
const SUPPORTED_ASPECT_RATIOS = ["16:9", "9:16"] as const satisfies readonly StudioAspectRatio[];
type SupportedAspectRatio = (typeof SUPPORTED_ASPECT_RATIOS)[number];

function asJson(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function cleanUrl(value?: string | null) {
  if (!value) return null;
  const next = value.trim();
  return next.length ? next : null;
}

function isSupportedDuration(value: unknown): value is (typeof SUPPORTED_DURATIONS)[number] {
  return typeof value === "number" && SUPPORTED_DURATIONS.includes(value as (typeof SUPPORTED_DURATIONS)[number]);
}

function isSupportedAspectRatio(value: unknown): value is SupportedAspectRatio {
  return typeof value === "string" && SUPPORTED_ASPECT_RATIOS.includes(value as SupportedAspectRatio);
}

async function uploadVideoBytes(input: {
  bucket: string;
  bytes: Buffer;
  fileName: string;
  mimeType: string;
}) {
  const supabase = getSupabaseAdminClient();
  const filePath = `video/${input.fileName}`;
  const { error: uploadError } = await supabase.storage.from(input.bucket).upload(filePath, input.bytes, {
    contentType: input.mimeType || "video/mp4",
    upsert: false,
  });

  if (uploadError) {
    throw new Error(`Supabase upload failed: ${uploadError.message}`);
  }

  const { data: publicData } = supabase.storage.from(input.bucket).getPublicUrl(filePath);
  return publicData.publicUrl;
}

export async function POST(request: Request) {
  try {
    const googleApiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET ?? "brand-assets";

    if (!googleApiKey) {
      return asJson(500, { success: false, error: "Missing GOOGLE_API_KEY or GEMINI_API_KEY." });
    }

    let payload: SimpleVideoGeneratePayload;
    try {
      payload = (await request.json()) as SimpleVideoGeneratePayload;
    } catch {
      return asJson(400, { success: false, error: "Invalid JSON body." });
    }

    const prompt = payload.prompt?.trim();
    if (!prompt) {
      return asJson(400, { success: false, error: "Prompt is required." });
    }

    const durationSeconds = payload.duration_seconds ?? 6;
    if (!isSupportedDuration(durationSeconds)) {
      return asJson(400, { success: false, error: "Supported duration values are 4, 6, and 8 seconds." });
    }

    const aspectRatio = payload.aspect_ratio ?? "9:16";
    if (!isSupportedAspectRatio(aspectRatio)) {
      return asJson(400, { success: false, error: "Supported aspect ratios are 16:9 and 9:16." });
    }

    const backend = findBackendById(payload.ai_backend_id) ?? getDefaultBackendForType("video");
    const firstFrameUrl = cleanUrl(payload.first_frame_url);
    const lastFrameUrl = cleanUrl(payload.last_frame_url);

    const result = await runVeoVideo({
      apiKey: googleApiKey,
      model: backend.model,
      prompt,
      durationSeconds,
      aspectRatio,
      firstFrameUrl,
      lastFrameUrl,
      referenceImageUrls: [],
    });

    const fileName = `${Date.now()}-simple-${durationSeconds}s.mp4`;
    const videoUrl = await uploadVideoBytes({
      bucket: supabaseBucket,
      bytes: result.bytes,
      fileName,
      mimeType: result.mimeType || "video/mp4",
    });

    return asJson(200, {
      success: true,
      data: {
        video_url: videoUrl,
        provider_output_uri: result.rawOutputUri,
        provider: "google-veo",
        model: backend.model,
        duration_seconds: durationSeconds,
        aspect_ratio: aspectRatio,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate simple video.";
    return asJson(500, { success: false, error: message });
  }
}
