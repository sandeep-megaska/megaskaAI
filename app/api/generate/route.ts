import { NextResponse } from "next/server";
import { applyOverlayToImage, type OverlayConfig } from "@/lib/overlay-image";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { ProviderUnavailableError } from "@/lib/ai/providerErrors";
import { runStudioGeneration, type StudioGenerationType } from "@/lib/generation/runStudioGeneration";

export const runtime = "nodejs";
export const maxDuration = 300;

type GeneratePayload = {
  prompt?: string;
  type?: StudioGenerationType;
  aspect_ratio?: "1:1" | "16:9" | "9:16";
  model_id?: string | null;
  preset_id?: string | null;
  ai_backend_id?: string | null;
  overlay?: OverlayConfig;
  reference_urls?: string[];
  studio_meta?: {
    studioWorkflowMode?: "master-candidates" | "more-views";
    masterGenerationId?: string | null;
    referenceKindsUsed?: string[];
    promptHash?: string;
    backendModel?: string;
  };
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

function fileExtensionForMime(mimeType: string, type: StudioGenerationType) {
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
      backendId: payload.ai_backend_id,
      referenceCount: allReferenceUrls.length,
    });

    let generationOutput;

    try {
      generationOutput = await runStudioGeneration({
        apiKey: googleApiKey,
        type,
        prompt: finalPrompt,
        aspectRatio,
        backendId: payload.ai_backend_id,
        referenceUrls: allReferenceUrls,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Unknown ai_backend_id.") {
        return asJson(400, { success: false, error: error.message });
      }
      if (error instanceof Error && error.message.includes("supports")) {
        return asJson(400, { success: false, error: error.message });
      }
      if (error instanceof Error && error.message.includes("Unsupported")) {
        return asJson(400, { success: false, error: error.message });
      }
      throw error;
    }

    let bytes = generationOutput.bytes;
    let mimeType = generationOutput.mimeType;

    if (generationOutput.mediaType === "Image") {
      const overlayResult = await applyOverlayToImage(bytes, overlay);
      bytes = overlayResult.buffer;
      if (overlay.headline || overlay.subtext || overlay.cta) {
        mimeType = overlayResult.contentType;
      }
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
    const generationMetaBase = hasOverlay
      ? {
          ...overlay,
          ai_backend_id: generationOutput.backend.id,
          ai_model: generationOutput.backendModel,
          backendModel: generationOutput.backendModel,
        }
      : {
          ai_backend_id: generationOutput.backend.id,
          ai_model: generationOutput.backendModel,
          backendModel: generationOutput.backendModel,
        };
    const generationMeta = payload.studio_meta ? { ...generationMetaBase, ...payload.studio_meta } : generationMetaBase;

    const { data: insertedGeneration, error: insertError } = await supabase
      .from("generations")
      .insert({
        prompt,
        type: generationOutput.mediaType,
        media_type: generationOutput.mediaType,
        aspect_ratio: aspectRatio,
        asset_url: publicUrl,
        url: publicUrl,
        model_id: payload.model_id ?? null,
        preset_id: payload.preset_id ?? null,
        overlay_json: generationMeta,
        reference_urls: allReferenceUrls,
        generation_kind: type,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[generate] db insert error", insertError);
      return asJson(500, { success: false, error: `Generation insert failed: ${insertError.message}` });
    }

    console.log("[generate] success", {
      type,
      backend: generationOutput.backend.id,
      path: filePath,
      elapsedMs: Date.now() - startedAt,
    });

    return asJson(200, {
      success: true,
      generationId: insertedGeneration.id,
      outputUrl: publicUrl,
      backend: generationOutput.backend.id,
      backendModel: generationOutput.backendModel,
      mediaType: generationOutput.mediaType,
      type,
      prompt,
      final_prompt: finalPrompt,
      aspect_ratio: aspectRatio,
      ai_backend_id: generationOutput.backend.id,
      ai_model: generationOutput.backendModel,
      url: publicUrl,
      path: filePath,
    });
  } catch (error) {
    console.error("[generate] unhandled error", error);

    if (error instanceof ProviderUnavailableError) {
      return asJson(503, {
        success: false,
        error_code: error.errorCode,
        error: "AI image service is busy right now. Please retry.",
      });
    }

    if (error instanceof Error && /(429|503|UNAVAILABLE|RATE)/i.test(error.message)) {
      return asJson(503, {
        success: false,
        error: "AI image service is busy right now. Please retry.",
      });
    }

    return asJson(500, {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
}
