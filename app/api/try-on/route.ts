import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { compileTryOnPrompt } from "@/lib/tryon/compileTryOnPrompt";
import { runTryOnJob } from "@/lib/tryon/runTryOnJob";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function sanitizeForPath(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function fileExtensionForMime(mimeType: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return "bin";
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("tryon_jobs")
      .select("*, garment_library(display_name,garment_code), model_library(display_name,model_code)")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return json(500, { success: false, error: error.message });
    }

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
    const personAssetUrl = body.person_asset_url ? String(body.person_asset_url) : null;
    const garmentId = body.garment_id ? String(body.garment_id) : null;

    if (!garmentId) {
      return json(400, { success: false, error: "garment_id is required." });
    }

    if (!modelId && !personAssetUrl) {
      return json(400, { success: false, error: "Provide either model_id or person_asset_url." });
    }

    const sourceMode = modelId ? "model_library" : "manual_upload";
    const constraints = typeof body.constraints === "object" && body.constraints ? body.constraints : {};

    const { data: garment, error: garmentError } = await supabase
      .from("garment_library")
      .select("*, garment_assets(*)")
      .eq("id", garmentId)
      .single();

    if (garmentError || !garment) {
      return json(404, { success: false, error: garmentError?.message || "Garment not found." });
    }

    const garmentAssets = (garment.garment_assets ?? []) as { public_url: string }[];

    if (!garmentAssets.length) {
      return json(400, { success: false, error: "Selected garment has no uploaded assets." });
    }

    let model: { id: string; display_name: string } | null = null;
    if (modelId) {
      const { data: modelData, error: modelError } = await supabase
        .from("model_library")
        .select("id,display_name")
        .eq("id", modelId)
        .single();
      if (modelError || !modelData) {
        return json(404, { success: false, error: modelError?.message || "Model not found." });
      }
      model = modelData;
    }

    const { data: createdJob, error: jobInsertError } = await supabase
      .from("tryon_jobs")
      .insert({
        job_code: `TO-${Date.now()}`,
        status: "queued",
        source_mode: sourceMode,
        model_id: modelId,
        person_asset_url: personAssetUrl,
        garment_id: garmentId,
        preset_id: body.preset_id ?? null,
        backend: body.backend ?? null,
        engine_mode: body.engine_mode ?? null,
        prompt: body.prompt ?? null,
        negative_prompt: body.negative_prompt ?? null,
        constraints,
      })
      .select("id")
      .single();

    if (jobInsertError || !createdJob) {
      return json(500, { success: false, error: jobInsertError?.message || "Unable to create try-on job." });
    }

    jobId = createdJob.id;

    await supabase.from("tryon_jobs").update({ status: "running" }).eq("id", jobId);

    const compiled = compileTryOnPrompt({
      subject: {
        sourceMode,
        modelName: model?.display_name,
        personAssetUrl,
      },
      garment: {
        garmentCode: garment.garment_code,
        displayName: garment.display_name,
        category: garment.category,
        colorway: garment.colorway,
        printType: garment.print_type,
        description: garment.description,
        fabricNotes: garment.fabric_notes,
        silhouetteNotes: garment.silhouette_notes,
        coverageNotes: garment.coverage_notes,
        assetUrls: garmentAssets.map((item) => item.public_url),
      },
      constraints,
      prompt: body.prompt ?? null,
      negativePrompt: body.negative_prompt ?? null,
      engineMode: body.engine_mode ?? null,
    });

    const tryOnOutput = await runTryOnJob({
      backendId: body.backend,
      prompt: compiled.prompt,
      negativePrompt: compiled.negativePrompt,
      aspectRatio: body.aspect_ratio,
    });

    const ext = fileExtensionForMime(tryOnOutput.mimeType);
    const outputPath = `try-on/${Date.now()}-${sanitizeForPath(garment.display_name)}.${ext}`;

    const { error: uploadError } = await supabase.storage.from("brand-assets").upload(outputPath, tryOnOutput.bytes, {
      contentType: tryOnOutput.mimeType,
      upsert: false,
    });

    if (uploadError) {
      throw new Error(`Output upload failed: ${uploadError.message}`);
    }

    const { data: publicData } = supabase.storage.from("brand-assets").getPublicUrl(outputPath);

    const { data: generation, error: generationError } = await supabase
      .from("generations")
      .insert({
        prompt: body.prompt ?? compiled.prompt,
        type: "Image",
        media_type: "Image",
        aspect_ratio: body.aspect_ratio ?? "1:1",
        asset_url: publicData.publicUrl,
        url: publicData.publicUrl,
        model_id: modelId,
        preset_id: body.preset_id ?? null,
        reference_urls: [
          ...(personAssetUrl ? [personAssetUrl] : []),
          ...garmentAssets.map((item) => item.public_url),
        ],
        overlay_json: {
          workflow: "try_on_beta",
          backend: tryOnOutput.backendId,
          backend_model: tryOnOutput.backendModel,
          constraints,
        },
        generation_kind: "image",
      })
      .select("id")
      .single();

    if (generationError || !generation) {
      throw new Error(generationError?.message || "Failed to insert generation row.");
    }

    await supabase.from("tryon_jobs").update({
      status: "completed",
      result_generation_id: generation.id,
      backend: tryOnOutput.backendId,
      prompt: compiled.prompt,
      negative_prompt: compiled.negativePrompt,
      error_message: null,
    }).eq("id", jobId);

    const jobAssets = [
      ...garmentAssets.map((asset) => ({
        tryon_job_id: jobId,
        asset_role: "garment_reference",
        file_path: asset.public_url,
        public_url: asset.public_url,
        meta: {},
      })),
      ...(personAssetUrl ? [{
        tryon_job_id: jobId,
        asset_role: "person_reference",
        file_path: personAssetUrl,
        public_url: personAssetUrl,
        meta: {},
      }] : []),
      {
        tryon_job_id: jobId,
        asset_role: "output",
        file_path: outputPath,
        public_url: publicData.publicUrl,
        meta: {
          backend: tryOnOutput.backendId,
          backend_model: tryOnOutput.backendModel,
        },
      },
    ];

    await supabase.from("tryon_job_assets").insert(jobAssets);

    return json(200, {
      success: true,
      data: {
        tryon_job_id: jobId,
        generation_id: generation.id,
        status: "completed",
        output_url: publicData.publicUrl,
        instruction_bundle: compiled.instructionBundle,
      },
    });
  } catch (error) {
    if (jobId) {
      await supabase.from("tryon_jobs").update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Unexpected try-on server error.",
      }).eq("id", jobId);
    }

    return json(500, {
      success: false,
      tryon_job_id: jobId,
      error: error instanceof Error ? error.message : "Unexpected try-on server error.",
    });
  }
}
