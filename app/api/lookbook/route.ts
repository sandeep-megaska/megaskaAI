import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { findBackendById } from "@/lib/ai-backends";
import { isGeminiImageModel, isImagenModel, isVeoModel } from "@/lib/ai/backendFamilies";
import { buildShotPlan } from "@/lib/lookbook/buildShotPlan";
import { runLookbookJob } from "@/lib/lookbook/runLookbookJob";
import type { LookbookJobVariant, LookbookReferenceImage, LookbookShotSpec, LookbookThemeKey } from "@/lib/lookbook/types";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function sanitizeForPath(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

function fileExtensionForMime(mimeType: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return "bin";
}

type ModelAsset = { id: string; asset_url: string; is_primary: boolean; sort_order: number | null };
type GarmentAsset = { id: string; public_url: string; view_label: string | null; detail_zone: string | null; is_primary: boolean; sort_order: number | null };
const LIFESTYLE_THEMES: LookbookThemeKey[] = [
  "luxury_poolside",
  "resort_editorial",
  "premium_studio_lifestyle",
  "tropical_escape",
  "minimal_neutral_editorial",
  "sunlit_terrace",
  "modern_indoor_luxury",
];

function parseLookbookVariant(value: unknown): LookbookJobVariant {
  return value === "lifestyle" ? "lifestyle" : "catalog";
}

function parseThemeKey(value: unknown, jobVariant: LookbookJobVariant): LookbookThemeKey | null {
  if (jobVariant !== "lifestyle") return null;
  if (typeof value !== "string") return null;
  return LIFESTYLE_THEMES.includes(value as LookbookThemeKey) ? (value as LookbookThemeKey) : null;
}

function pickGarmentReferences(garment: {
  primary_front_asset_id?: string | null;
  primary_back_asset_id?: string | null;
  garment_assets?: GarmentAsset[];
}) {
  const assets = garment.garment_assets ?? [];
  const byId = new Map(assets.map((asset) => [asset.id, asset]));

  const frontCandidates = assets.filter((asset) => /front/i.test(asset.view_label ?? ""));
  const backCandidates = assets.filter((asset) => /back/i.test(asset.view_label ?? ""));
  const detailCandidates = assets.filter((asset) => /detail|close/i.test(asset.view_label ?? "") || Boolean(asset.detail_zone));

  const front =
    (garment.primary_front_asset_id ? byId.get(garment.primary_front_asset_id) : null)
    ?? frontCandidates[0]
    ?? assets[0]
    ?? null;
  const back =
    (garment.primary_back_asset_id ? byId.get(garment.primary_back_asset_id) : null)
    ?? backCandidates[0]
    ?? (assets.find((asset) => asset.id !== front?.id) ?? null);

  return {
    front,
    back,
    details: detailCandidates.slice(0, 2),
  };
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("lookbook_jobs")
      .select("*, model_library(display_name,model_code), garment_library(display_name,garment_code), lookbook_job_shots(*)")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) return json(500, { success: false, error: error.message });
    return json(200, { success: true, data: data ?? [] });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdminClient();
  let jobId: string | null = null;

  try {
    const body = await request.json();

    const modelId = body.model_id ? String(body.model_id) : null;
    const garmentId = body.garment_id ? String(body.garment_id) : null;
    const backendId = body.backend ? String(body.backend) : null;
    const jobVariant = parseLookbookVariant(body.job_variant ?? body.variant ?? body.mode);
    const themeKey = parseThemeKey(body.theme_key, jobVariant);

    if (!modelId) return json(400, { success: false, error: "model_id is required for Consistent Lookbook." });
    if (!garmentId) return json(400, { success: false, error: "garment_id is required for Consistent Lookbook." });

    const backend = findBackendById(backendId) ?? findBackendById("nano-banana-pro");
    if (!backend) return json(400, { success: false, error: "No backend available." });
    if (isImagenModel(backend.model)) {
      return json(400, { success: false, error: "Imagen is not supported for Consistent Lookbook. Use a Gemini image backend." });
    }
    if (isVeoModel(backend.model)) {
      return json(400, { success: false, error: "Veo is not supported for Consistent Lookbook. Use a Gemini image backend." });
    }
    if (!isGeminiImageModel(backend.model)) {
      return json(400, { success: false, error: "Consistent Lookbook requires Gemini image family backends." });
    }

    const { data: model, error: modelError } = await supabase
      .from("model_library")
      .select("id,display_name,model_code")
      .eq("id", modelId)
      .single();

    if (modelError || !model) return json(404, { success: false, error: modelError?.message || "Model not found." });

    const { data: modelAssets } = await supabase
      .from("model_assets")
      .select("id,asset_url,is_primary,sort_order")
      .eq("model_id", modelId)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .limit(6);

    const modelIdentityAssets = (modelAssets ?? []).filter((asset: ModelAsset) => Boolean(asset.asset_url));
    if (!modelIdentityAssets.length) {
      return json(400, { success: false, error: "Consistent Lookbook requires at least 1 model identity image." });
    }

    const { data: garment, error: garmentError } = await supabase
      .from("garment_library")
      .select("id,display_name,garment_code,primary_front_asset_id,primary_back_asset_id,garment_assets!garment_assets_garment_id_fkey(id,public_url,view_label,detail_zone,is_primary,sort_order)")
      .eq("id", garmentId)
      .single();

    if (garmentError || !garment) return json(404, { success: false, error: garmentError?.message || "Garment not found." });

    const picked = pickGarmentReferences(garment as { primary_front_asset_id?: string | null; primary_back_asset_id?: string | null; garment_assets?: GarmentAsset[] });
    if (!picked.front) return json(400, { success: false, error: "Consistent Lookbook requires at least 1 garment front image." });
    if (!picked.back) return json(400, { success: false, error: "Consistent Lookbook requires at least 1 garment back image." });

    const references: LookbookReferenceImage[] = [
      ...modelIdentityAssets.slice(0, 3).map(
        (asset: ModelAsset): LookbookReferenceImage => ({
          kind: "model_identity",
          url: asset.asset_url,
          assetId: asset.id,
          label: "model_identity",
        }),
      ),
      { kind: "garment_front", url: picked.front.public_url, assetId: picked.front.id, label: "garment_front" },
      { kind: "garment_back", url: picked.back.public_url, assetId: picked.back.id, label: "garment_back" },
      ...picked.details.map(
        (asset): LookbookReferenceImage => ({
          kind: "garment_detail",
          url: asset.public_url,
          assetId: asset.id,
          label: asset.detail_zone ?? "garment_detail",
        }),
      ),
    ];

    const shotSpecs = buildShotPlan({
      shotSpecs: Array.isArray(body.shot_specs) ? (body.shot_specs as LookbookShotSpec[]) : null,
      variant: jobVariant,
    });
    const outputStyle = jobVariant === "lifestyle"
      ? "lifestyle"
      : (body.output_style === "studio" || body.output_style === "lifestyle" ? body.output_style : "catalog");

    const { data: createdJob, error: jobInsertError } = await supabase
      .from("lookbook_jobs")
      .insert({
        job_code: `LB-${Date.now()}`,
        status: "queued",
        model_id: modelId,
        garment_id: garmentId,
        backend: backend.id,
        backend_model: backend.model,
        workflow_mode: "consistent-lookbook",
        output_style: outputStyle,
        job_variant: jobVariant,
        theme_key: themeKey,
        no_reconstruction: true,
        debug_trace: {
          backendModel: backend.model,
          jobVariant,
          themeKey,
          referenceKinds: Array.from(new Set(references.map((item) => item.kind))),
          noReconstruction: true,
        },
      })
      .select("id")
      .single();

    if (jobInsertError || !createdJob) {
      return json(500, { success: false, error: jobInsertError?.message || "Unable to create lookbook job." });
    }

    jobId = createdJob.id;

    await supabase.from("lookbook_job_shots").insert(
      shotSpecs.map((shot, index) => ({
        lookbook_job_id: jobId,
        shot_key: shot.shotKey,
        shot_title: shot.title,
        shot_order: index,
        scene_key: shot.sceneKey ?? null,
        pose_key: shot.poseKey ?? null,
        mood_key: shot.moodKey ?? null,
        status: "queued",
        debug_trace: {
          shotSpecSnapshot: shot,
          regenerateCount: 0,
        },
      })),
    );

    await supabase.from("lookbook_jobs").update({ status: "running" }).eq("id", jobId);

    const result = await runLookbookJob({
      backendId: backend.id,
      references,
      outputStyle,
      jobVariant,
      themeKey,
      shotSpecs,
    });

    const contactSheet: Array<{ shotKey: string; title: string; outputUrl: string; generationId: string; shotOrder: number; regenerateCount: number }> = [];
    const generationIds: string[] = [];

    for (let index = 0; index < result.shots.length; index += 1) {
      const shotResult = result.shots[index];
      const ext = fileExtensionForMime(shotResult.mimeType);
      const outputPath = `lookbook/${jobId}/${index + 1}-${sanitizeForPath(shotResult.shot.shotKey)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("brand-assets")
        .upload(outputPath, shotResult.bytes, { contentType: shotResult.mimeType, upsert: false });

      if (uploadError) throw new Error(`Shot upload failed (${shotResult.shot.shotKey}): ${uploadError.message}`);

      const { data: publicData } = supabase.storage.from("brand-assets").getPublicUrl(outputPath);

      const { data: generation, error: generationError } = await supabase
        .from("generations")
        .insert({
          prompt: shotResult.debugTrace.promptBlocks ? "Consistent Lookbook shot" : `Lookbook shot ${shotResult.shot.title}`,
          type: "Image",
          media_type: "Image",
          aspect_ratio: shotResult.shot.aspectRatio ?? "1:1",
          asset_url: publicData.publicUrl,
          url: publicData.publicUrl,
          model_id: modelId,
          reference_urls: references.map((item) => item.url),
          overlay_json: {
            workflow: "consistent-lookbook",
            lookbook_job_id: jobId,
            shot_key: shotResult.shot.shotKey,
            backend: result.backendId,
            backend_model: result.backendModel,
            job_variant: jobVariant,
            theme_key: themeKey,
            debug_trace: shotResult.debugTrace,
          },
          generation_kind: "image",
        })
        .select("id")
        .single();

      if (generationError || !generation) {
        throw new Error(generationError?.message || `Failed to persist generation for shot '${shotResult.shot.shotKey}'.`);
      }

      generationIds.push(generation.id);

      await supabase
        .from("lookbook_job_shots")
        .update({
          status: "completed",
          output_url: publicData.publicUrl,
          generation_id: generation.id,
          prompt_hash: String(shotResult.debugTrace.promptHash ?? ""),
          debug_trace: {
            ...shotResult.debugTrace,
            shotSpecSnapshot: shotResult.shot,
            regenerateCount: 0,
          },
          error_message: null,
        })
        .eq("lookbook_job_id", jobId)
        .eq("shot_key", shotResult.shot.shotKey);

      contactSheet.push({
        shotKey: shotResult.shot.shotKey,
        title: shotResult.shot.title,
        outputUrl: publicData.publicUrl,
        generationId: generation.id,
        shotOrder: index,
        regenerateCount: 0,
      });
    }

    await supabase
      .from("lookbook_jobs")
      .update({
        status: "completed",
        result_generation_ids: generationIds,
        debug_trace: {
          backendModel: result.backendModel,
          noReconstruction: true,
          shotCount: result.shots.length,
        },
        error_message: null,
      })
      .eq("id", jobId);

    return json(200, {
      success: true,
      lookbookJobId: jobId,
      workflowMode: result.workflowMode,
      jobVariant,
      themeKey,
      backend: result.backendId,
      backendModel: result.backendModel,
      shots: contactSheet,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected lookbook server error.";
    if (jobId) {
      await supabase.from("lookbook_jobs").update({ status: "failed", error_message: message }).eq("id", jobId);
    }

    return json(500, {
      success: false,
      lookbook_job_id: jobId,
      error: message,
    });
  }
}
