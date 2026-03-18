import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { buildShotPlan } from "@/lib/lookbook/buildShotPlan";
import { runLookbookJob } from "@/lib/lookbook/runLookbookJob";
import type { LookbookJobVariant, LookbookReferenceImage, LookbookShotSpec, LookbookThemeKey } from "@/lib/lookbook/types";

type Params = { jobId: string; shotKey: string };

type ExistingShotRow = {
  id: string;
  lookbook_job_id: string;
  shot_key: string;
  shot_title: string;
  shot_order: number;
  scene_key: string | null;
  pose_key: string | null;
  mood_key: string | null;
  generation_id: string | null;
  debug_trace: Record<string, unknown> | null;
};

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

function parseThemeKey(value: unknown): LookbookThemeKey | null {
  return typeof value === "string" ? (value as LookbookThemeKey) : null;
}

function toReference(url: string, index: number): LookbookReferenceImage {
  if (index < 3) {
    return {
      kind: "model_identity",
      url,
      label: "model_identity",
    };
  }

  if (index === 3) {
    return {
      kind: "garment_front",
      url,
      label: "garment_front",
    };
  }

  if (index === 4) {
    return {
      kind: "garment_back",
      url,
      label: "garment_back",
    };
  }

  return {
    kind: "garment_detail",
    url,
    label: "garment_detail",
  };
}

function resolveShotSpec(shot: ExistingShotRow, jobVariant: LookbookJobVariant): LookbookShotSpec {
  const snapshot = shot.debug_trace && typeof shot.debug_trace === "object"
    ? (shot.debug_trace.shotSpecSnapshot as Partial<LookbookShotSpec> | undefined)
    : undefined;

  if (snapshot?.shotKey && snapshot.instruction) {
    return {
      ...snapshot,
      shotKey: snapshot.shotKey,
      title: snapshot.title ?? shot.shot_title,
      instruction: snapshot.instruction,
      sceneKey: shot.scene_key ?? snapshot.sceneKey ?? null,
      poseKey: shot.pose_key ?? snapshot.poseKey ?? null,
      moodKey: shot.mood_key ?? snapshot.moodKey ?? null,
    } as LookbookShotSpec;
  }

  const fallback = buildShotPlan({ variant: jobVariant }).find((candidate) => candidate.shotKey === shot.shot_key);
  if (!fallback) {
    throw new Error(`Unable to resolve shot spec for '${shot.shot_key}'.`);
  }

  return {
    ...fallback,
    title: shot.shot_title || fallback.title,
    sceneKey: shot.scene_key ?? fallback.sceneKey ?? null,
    poseKey: shot.pose_key ?? fallback.poseKey ?? null,
    moodKey: shot.mood_key ?? fallback.moodKey ?? null,
  };
}

export async function POST(_: Request, { params }: { params: Promise<Params> }) {
  const { jobId, shotKey } = await params;
  const supabase = getSupabaseAdminClient();

  try {
    const { data: job, error: jobError } = await supabase
      .from("lookbook_jobs")
      .select("id,model_id,garment_id,backend,backend_model,output_style,job_variant,theme_key,result_generation_ids")
      .eq("id", jobId)
      .single();

    if (jobError || !job) return json(404, { success: false, error: jobError?.message || "Lookbook job not found." });

    const { data: shot, error: shotError } = await supabase
      .from("lookbook_job_shots")
      .select("id,lookbook_job_id,shot_key,shot_title,shot_order,scene_key,pose_key,mood_key,generation_id,debug_trace")
      .eq("lookbook_job_id", jobId)
      .eq("shot_key", shotKey)
      .single();

    if (shotError || !shot) return json(404, { success: false, error: shotError?.message || "Lookbook shot not found." });

    const previousGenerationId = shot.generation_id;
    if (!previousGenerationId) {
      return json(400, { success: false, error: "Shot has no prior generation to regenerate from." });
    }

    const { data: previousGeneration, error: generationError } = await supabase
      .from("generations")
      .select("reference_urls")
      .eq("id", previousGenerationId)
      .single();

    if (generationError || !previousGeneration) {
      return json(404, { success: false, error: generationError?.message || "Previous generation context not found." });
    }

    const referenceUrls = Array.isArray(previousGeneration.reference_urls)
      ? previousGeneration.reference_urls.filter((url): url is string => Boolean(url))
      : [];

    if (!referenceUrls.length) {
      return json(400, { success: false, error: "Previous generation does not contain reference URLs." });
    }

    const references = referenceUrls.map((url, index) => toReference(url, index));
    const jobVariant = (job.job_variant === "lifestyle" ? "lifestyle" : "catalog") as LookbookJobVariant;
    const shotSpec = resolveShotSpec(shot, jobVariant);

    await supabase
      .from("lookbook_job_shots")
      .update({ status: "running", error_message: null })
      .eq("id", shot.id);

    const result = await runLookbookJob({
      backendId: typeof job.backend === "string" ? job.backend : null,
      references,
      outputStyle: jobVariant === "lifestyle" ? "lifestyle" : "catalog",
      jobVariant,
      themeKey: parseThemeKey(job.theme_key),
      shotSpecs: [shotSpec],
    });

    const shotResult = result.shots[0];
    const ext = fileExtensionForMime(shotResult.mimeType);
    const outputPath = `lookbook/${jobId}/${shot.shot_order + 1}-${sanitizeForPath(shotResult.shot.shotKey)}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("brand-assets")
      .upload(outputPath, shotResult.bytes, { contentType: shotResult.mimeType, upsert: false });

    if (uploadError) throw new Error(`Shot upload failed (${shotResult.shot.shotKey}): ${uploadError.message}`);

    const { data: publicData } = supabase.storage.from("brand-assets").getPublicUrl(outputPath);

    const { data: generation, error: persistGenerationError } = await supabase
      .from("generations")
      .insert({
        prompt: shotResult.debugTrace.promptBlocks ? "Consistent Lookbook shot" : `Lookbook shot ${shotResult.shot.title}`,
        type: "Image",
        media_type: "Image",
        aspect_ratio: shotResult.shot.aspectRatio ?? "1:1",
        asset_url: publicData.publicUrl,
        url: publicData.publicUrl,
        model_id: job.model_id,
        reference_urls: references.map((item) => item.url),
        overlay_json: {
          workflow: "consistent-lookbook",
          lookbook_job_id: jobId,
          shot_key: shotResult.shot.shotKey,
          backend: result.backendId,
          backend_model: result.backendModel,
          job_variant: jobVariant,
          theme_key: parseThemeKey(job.theme_key),
          debug_trace: shotResult.debugTrace,
          regenerate: true,
        },
        generation_kind: "image",
      })
      .select("id")
      .single();

    if (persistGenerationError || !generation) {
      throw new Error(persistGenerationError?.message || `Failed to persist regenerated shot '${shotResult.shot.shotKey}'.`);
    }

    const priorTrace = (shot.debug_trace ?? {}) as Record<string, unknown>;
    const priorCount = typeof priorTrace.regenerateCount === "number" ? priorTrace.regenerateCount : 0;
    const regeneratedAt = new Date().toISOString();

    const updatedTrace: Record<string, unknown> = {
      ...priorTrace,
      ...shotResult.debugTrace,
      shotSpecSnapshot: shotSpec,
      regenerateCount: priorCount + 1,
      regeneratedAt,
      previousGenerationId,
    };

    await supabase
      .from("lookbook_job_shots")
      .update({
        status: "completed",
        output_url: publicData.publicUrl,
        generation_id: generation.id,
        prompt_hash: String(shotResult.debugTrace.promptHash ?? ""),
        debug_trace: updatedTrace,
        error_message: null,
      })
      .eq("id", shot.id);

    const resultGenerationIds = Array.isArray(job.result_generation_ids)
      ? [...job.result_generation_ids.filter((id: unknown): id is string => typeof id === "string" && id !== previousGenerationId), generation.id]
      : [generation.id];

    await supabase
      .from("lookbook_jobs")
      .update({
        status: "completed",
        result_generation_ids: resultGenerationIds,
        error_message: null,
      })
      .eq("id", jobId);

    return json(200, {
      success: true,
      shot: {
        shotKey: shotResult.shot.shotKey,
        title: shotResult.shot.title,
        outputUrl: publicData.publicUrl,
        generationId: generation.id,
        shotOrder: shot.shot_order,
        updatedAt: regeneratedAt,
        regenerateCount: priorCount + 1,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected shot regeneration error.";
    await supabase
      .from("lookbook_job_shots")
      .update({ status: "failed", error_message: message })
      .eq("lookbook_job_id", jobId)
      .eq("shot_key", shotKey);

    return json(500, {
      success: false,
      error: message,
    });
  }
}
