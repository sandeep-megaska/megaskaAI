import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { applyDeterministicOverlay, type OverlayConfig } from "@/lib/overlay-image";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 300;

type GenerationType = "image" | "video";

type GeneratePayload = {
  prompt?: string;
  type?: GenerationType;
  aspect_ratio?: "1:1" | "16:9" | "9:16";
  model_id?: string | null;
  preset_id?: string | null;
  overlay?: OverlayConfig;
  reference_urls?: string[];
};

const IMAGE_MODEL = process.env.GOOGLE_IMAGE_MODEL ?? "imagen-4.0-generate-001";
const VIDEO_MODEL = process.env.GOOGLE_VIDEO_MODEL ?? "veo-2.0-generate-001";

function asJson(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function fileExtensionForMime(mimeType: string, type: GenerationType) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("webm")) return "webm";
  return type === "video" ? "mp4" : "png";
}

function sanitizeForPath(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48) || "asset";
}

async function resolveVideoBytes(video: { videoBytes?: string; uri?: string; mimeType?: string }) {
  if (video.videoBytes) {
    return Buffer.from(video.videoBytes, "base64");
  }

  if (!video.uri) {
    return null;
  }

  const response = await fetch(video.uri);
  if (!response.ok) {
    throw new Error(`Unable to download generated video from URI (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "generate route is live" });
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const googleApiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    const supabaseBucket = process.env.SUPABASE_STORAGE_BUCKET ?? "brand-assets";

    if (!googleApiKey) {
      return asJson(500, { success: false, error: "Missing GOOGLE_API_KEY or GEMINI_API_KEY." });
    }

    let payload: GeneratePayload;

    try {
      payload = (await request.json()) as GeneratePayload;
    } catch {
      return asJson(400, { success: false, error: "Invalid JSON body." });
    }

    const prompt = payload.prompt?.trim();
    const type = payload.type ?? "image";
    const aspectRatio = payload.aspect_ratio ?? "1:1";
    const overlay = payload.overlay ?? {};
    const referenceUrls = payload.reference_urls ?? [];

    if (!prompt) {
      return asJson(400, { success: false, error: "Prompt is required." });
    }

    if (type !== "image" && type !== "video") {
      return asJson(400, { success: false, error: "Type must be 'image' or 'video'." });
    }

    const supabase = getSupabaseAdminClient();

    const [modelResult, presetResult] = await Promise.all([
      payload.model_id ? supabase.from("model_library").select("id,prompt_anchor").eq("id", payload.model_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      payload.preset_id
        ? supabase.from("brand_presets").select("id,prompt_template").eq("id", payload.preset_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const finalPrompt = [presetResult.data?.prompt_template, modelResult.data?.prompt_anchor, prompt]
      .filter(Boolean)
      .join("\n\n");

    console.log("[generate] request", {
      type,
      aspectRatio,
      promptLength: prompt.length,
      modelId: payload.model_id,
      presetId: payload.preset_id,
      referenceCount: referenceUrls.length,
    });

    const ai = new GoogleGenAI({ apiKey: googleApiKey });

    let bytes: Buffer;
    let mimeType: string;

    if (type === "image") {
      const promptWithReferences =
        referenceUrls.length > 0
          ? `${finalPrompt}\n\nReference image URLs:\n${referenceUrls.map((url) => `- ${url}`).join("\n")}`
          : finalPrompt;

      const imageResponse = await ai.models.generateImages({
        model: IMAGE_MODEL,
        prompt: promptWithReferences,
        config: {
          numberOfImages: 1,
          aspectRatio,
        },
      });

      const image = imageResponse.generatedImages?.[0]?.image;
      if (!image?.imageBytes) {
        return asJson(502, { success: false, error: "Image generation returned no image bytes." });
      }

      bytes = Buffer.from(image.imageBytes, "base64");
      mimeType = image.mimeType ?? "image/png";

      if (overlay.headline || overlay.subtext || overlay.cta) {
        bytes = await applyDeterministicOverlay(bytes, overlay);
        mimeType = "image/png";
      }
    } else {
      let operation = await ai.models.generateVideos({
        model: VIDEO_MODEL,
        source: { prompt: finalPrompt },
        config: {
          numberOfVideos: 1,
          aspectRatio,
        },
      });

      let pollCount = 0;
      while (!operation.done && pollCount < 60) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({ operation });
        pollCount += 1;
      }

      if (!operation.done) {
        return asJson(504, { success: false, error: "Video generation timed out before completion." });
      }

      const generatedVideo = operation.response?.generatedVideos?.[0]?.video;
      if (!generatedVideo) {
        return asJson(502, { success: false, error: "Video generation returned no video output." });
      }

      const downloaded = await resolveVideoBytes(generatedVideo);
      if (!downloaded) {
        return asJson(502, { success: false, error: "Unable to resolve generated video bytes." });
      }

      bytes = downloaded;
      mimeType = generatedVideo.mimeType ?? "video/mp4";
    }

    const ext = fileExtensionForMime(mimeType, type);
    const fileName = `${Date.now()}-${sanitizeForPath(prompt)}.${ext}`;
    const filePath = `${type}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(supabaseBucket)
      .upload(filePath, bytes, { contentType: mimeType, upsert: false });

    if (uploadError) {
      console.error("[generate] upload error", uploadError);
      return asJson(500, { success: false, error: `Supabase upload failed: ${uploadError.message}` });
    }

    const { data: publicData } = supabase.storage.from(supabaseBucket).getPublicUrl(filePath);
    const publicUrl = publicData.publicUrl;

    const { error: insertError } = await supabase.from("generations").insert({
      prompt,
      type: type === "video" ? "Video" : "Image",
      media_type: type === "video" ? "Video" : "Image",
      aspect_ratio: aspectRatio,
      asset_url: publicUrl,
      url: publicUrl,
      model_id: payload.model_id ?? null,
      preset_id: payload.preset_id ?? null,
      overlay_json: overlay,
      reference_urls: referenceUrls,
      generation_kind: type,
    });

    if (insertError) {
      console.error("[generate] db insert error", insertError);
      return asJson(500, { success: false, error: `Generation insert failed: ${insertError.message}` });
    }

    console.log("[generate] success", {
      type,
      path: filePath,
      elapsedMs: Date.now() - startedAt,
    });

    return asJson(200, {
      success: true,
      type,
      prompt,
      final_prompt: finalPrompt,
      aspect_ratio: aspectRatio,
      url: publicUrl,
      path: filePath,
    });
  } catch (error) {
    console.error("[generate] unhandled error", error);

    return asJson(500, {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
}
