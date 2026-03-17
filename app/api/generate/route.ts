import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { findBackendById, getDefaultBackendForType, type AIBackendType } from "@/lib/ai-backends";
import { applyOverlayToImage, type OverlayConfig } from "@/lib/overlay-image";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { mapGeminiProviderError, ProviderUnavailableError } from "@/lib/ai/providerErrors";
import { isGeminiImageModel, isImagenModel } from "@/lib/ai/backendFamilies";

export const runtime = "nodejs";
export const maxDuration = 300;

type GenerationType = "image" | "video";

type GeneratePayload = {
  prompt?: string;
  type?: GenerationType;
  aspect_ratio?: "1:1" | "16:9" | "9:16";
  model_id?: string | null;
  preset_id?: string | null;
  ai_backend_id?: string | null;
  overlay?: OverlayConfig;
  reference_urls?: string[];
};

type ModelContext = {
  id: string;
  prompt_anchor?: string | null;
  negative_prompt?: string | null;
  model_assets?: { asset_url: string; is_primary?: boolean | null; sort_order?: number | null }[];
};

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

    if (!prompt) {
      return asJson(400, { success: false, error: "Prompt is required." });
    }

    if (type !== "image" && type !== "video") {
      return asJson(400, { success: false, error: "Type must be 'image' or 'video'." });
    }

    const requestedBackend = findBackendById(payload.ai_backend_id);
    if (payload.ai_backend_id && !requestedBackend) {
      return asJson(400, { success: false, error: "Unknown ai_backend_id." });
    }

    const backend = requestedBackend ?? getDefaultBackendForType(type as AIBackendType);

    if (backend.type !== type) {
      return asJson(400, { success: false, error: `Backend '${backend.id}' supports ${backend.type} only.` });
    }

    const supabase = getSupabaseAdminClient();

    const [modelResult, presetResult] = await Promise.all([
      payload.model_id
        ? supabase
            .from("model_library")
            .select("id,prompt_anchor,negative_prompt,model_assets(asset_url,is_primary,sort_order)")
            .eq("id", payload.model_id)
            .maybeSingle<ModelContext>()
        : Promise.resolve({ data: null, error: null }),
      payload.preset_id
        ? supabase.from("brand_presets").select("id,prompt_template").eq("id", payload.preset_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (modelResult.error) {
      console.error("[generate] model lookup error", modelResult.error);
      return asJson(400, { success: false, error: modelResult.error.message });
    }

    const modelAssetUrls = (modelResult.data?.model_assets ?? [])
      .sort((a, b) => {
        if ((a.is_primary ? 1 : 0) !== (b.is_primary ? 1 : 0)) return a.is_primary ? -1 : 1;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      })
      .map((asset) => asset.asset_url)
      .filter(Boolean);

    const allReferenceUrls = [...modelAssetUrls, ...(payload.reference_urls ?? [])];

    const finalPrompt = [
      presetResult.data?.prompt_template,
      modelResult.data?.prompt_anchor,
      modelResult.data?.negative_prompt ? `Avoid: ${modelResult.data.negative_prompt}` : null,
      prompt,
    ]
      .filter(Boolean)
      .join("\n\n");

    console.log("[generate] request", {
      type,
      aspectRatio,
      promptLength: prompt.length,
      modelId: payload.model_id,
      modelAssets: modelAssetUrls.length,
      presetId: payload.preset_id,
      backendId: backend.id,
      backendModel: backend.model,
      referenceCount: allReferenceUrls.length,
    });

    const ai = new GoogleGenAI({ apiKey: googleApiKey });

    let bytes: Buffer;
    let mimeType: string;

    if (type === "image") {
      // TODO: Replace URL-based guidance with native multi-image input when the selected backend path supports stable reference-image injection.
      const promptWithReferences =
        allReferenceUrls.length > 0
          ? `${finalPrompt}\n\nModel reference image URLs:\n${allReferenceUrls.map((url) => `- ${url}`).join("\n")}`
          : finalPrompt;

      if (isGeminiImageModel(backend.model)) {
        let inlineImageData: { data?: string; mimeType?: string } | null = null;

        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const response = await ai.models.generateContent({
              model: backend.model,
              contents: [{ role: "user", parts: [{ text: promptWithReferences }] }],
              config: {
                responseModalities: ["IMAGE"],
              },
            });

            inlineImageData =
              response.candidates?.flatMap((candidate) => candidate.content?.parts ?? []).find((part) => part.inlineData)
                ?.inlineData ?? null;

            if (inlineImageData?.data) {
              break;
            }

            throw new Error("Gemini image generation returned no image bytes.");
          } catch (error) {
            const message = String((error as { message?: string })?.message ?? "").toUpperCase();
            if (attempt === 0 && (message.includes("UNAVAILABLE") || message.includes("503"))) {
              await new Promise((resolve) => setTimeout(resolve, 500));
              continue;
            }

            mapGeminiProviderError(error);
          }
        }

        if (!inlineImageData?.data) {
          return asJson(502, { success: false, error: "Gemini image generation returned no image bytes." });
        }

        bytes = Buffer.from(inlineImageData.data, "base64");
        mimeType = inlineImageData.mimeType ?? "image/png";
      } else if (isImagenModel(backend.model)) {
        let imageResponse;

        try {
          imageResponse = await ai.models.generateImages({
            model: backend.model,
            prompt: promptWithReferences,
            config: {
              numberOfImages: 1,
              aspectRatio,
            },
          });
        } catch (error) {
          mapGeminiProviderError(error);
        }

        if (!imageResponse) {
          return asJson(502, { success: false, error: "Imagen generation failed before a response was returned." });
        }

        const image = imageResponse.generatedImages?.[0]?.image;
        if (!image?.imageBytes) {
          return asJson(502, { success: false, error: "Imagen generation returned no image bytes." });
        }

        bytes = Buffer.from(image.imageBytes, "base64");
        mimeType = image.mimeType ?? "image/png";
      } else {
        return asJson(400, {
          success: false,
          error: `Unsupported image backend family for model '${backend.model}'.`,
        });
      }

      const overlayResult = await applyOverlayToImage(bytes, overlay);
      bytes = overlayResult.buffer;
      if (overlay.headline || overlay.subtext || overlay.cta) {
        mimeType = overlayResult.contentType;
      }
    } else {
      let operation;
      try {
        operation = await ai.models.generateVideos({
          model: backend.model,
          source: { prompt: finalPrompt },
          config: {
            numberOfVideos: 1,
            aspectRatio,
          },
        });
      } catch (error) {
        mapGeminiProviderError(error);
      }

      if (!operation) {
        return asJson(502, { success: false, error: "Video generation failed before an operation was returned." });
      }

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

    const hasOverlay = Boolean(overlay.headline || overlay.subtext || overlay.cta);
    const generationMeta = hasOverlay
      ? { ...overlay, ai_backend_id: backend.id, ai_model: backend.model }
      : { ai_backend_id: backend.id, ai_model: backend.model };

    const { error: insertError } = await supabase.from("generations").insert({
      prompt,
      type: type === "video" ? "Video" : "Image",
      media_type: type === "video" ? "Video" : "Image",
      aspect_ratio: aspectRatio,
      asset_url: publicUrl,
      url: publicUrl,
      model_id: payload.model_id ?? null,
      preset_id: payload.preset_id ?? null,
      overlay_json: generationMeta,
      reference_urls: allReferenceUrls,
      generation_kind: type,
    });

    if (insertError) {
      console.error("[generate] db insert error", insertError);
      return asJson(500, { success: false, error: `Generation insert failed: ${insertError.message}` });
    }

    console.log("[generate] success", {
      type,
      backend: backend.id,
      path: filePath,
      elapsedMs: Date.now() - startedAt,
    });

    return asJson(200, {
      success: true,
      type,
      prompt,
      final_prompt: finalPrompt,
      aspect_ratio: aspectRatio,
      ai_backend_id: backend.id,
      ai_model: backend.model,
      url: publicUrl,
      path: filePath,
    });
  } catch (error) {
    console.error("[generate] unhandled error", error);

    if (error instanceof ProviderUnavailableError) {
      return asJson(503, {
        success: false,
        error_code: error.errorCode,
        error: error.message,
      });
    }

    return asJson(500, {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
}
