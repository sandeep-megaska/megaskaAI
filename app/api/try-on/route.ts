import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { compileTryOnPrompt } from "@/lib/tryon/compileTryOnPrompt";
import { runTryOnJob } from "@/lib/tryon/runTryOnJob";
import { buildConstraintProfile } from "@/lib/tryon/buildConstraintProfile";
import { computeGarmentReadiness } from "@/lib/tryon/computeGarmentReadiness";
import { selectGarmentReferencePack } from "@/lib/tryon/selectGarmentReferencePack";
import { persistTryOnLineage } from "@/lib/tryon/persistTryOnLineage";
import { GarmentAssetRecord, PrintFidelityLevel, WorkflowMode } from "@/lib/tryon/types";
import { buildWorkflowProfile } from "@/lib/tryon/buildWorkflowProfile";
import { buildHardPreservationRules } from "@/lib/tryon/buildHardPreservationRules";
import { buildForbiddenTransformations } from "@/lib/tryon/buildForbiddenTransformations";
import { evaluateCatalogReadinessGate } from "@/lib/tryon/evaluateCatalogReadinessGate";
import { computePrintReadiness } from "@/lib/tryon/computePrintReadiness";
import { buildPrintPreservationRules } from "@/lib/tryon/buildPrintPreservationRules";
import { buildPrintForbiddenTransformations } from "@/lib/tryon/buildPrintForbiddenTransformations";
import { evaluatePrintGate } from "@/lib/tryon/evaluatePrintGate";
import { ProviderUnavailableError } from "@/lib/ai/providerErrors";

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

function normalizePrintFidelityLevel(value: unknown, workflowMode: WorkflowMode): PrintFidelityLevel {
  if (value === "balanced" || value === "strict" || value === "hard_lock") return value;
  return workflowMode === "catalog_fidelity" ? "strict" : "balanced";
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("tryon_jobs")
      .select("*, garment_library(display_name,garment_code), model_library(display_name,model_code)")
      .order("created_at", { ascending: false })
      .limit(20);

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
    const personAssetUrl = body.person_asset_url ? String(body.person_asset_url) : null;
    const garmentId = body.garment_id ? String(body.garment_id) : null;

    if (!garmentId) return json(400, { success: false, error: "garment_id is required." });
    if (!modelId && !personAssetUrl) return json(400, { success: false, error: "Provide either model_id or person_asset_url." });

    const sourceMode = modelId ? "model_library" : "manual_upload";
    const constraints = typeof body.constraints === "object" && body.constraints ? body.constraints : {};

    const workflowProfile = buildWorkflowProfile({
      workflowMode: body.workflow_mode,
      fidelityLevel: body.fidelity_level,
      preferredOutputStyle: body.preferred_output_style,
      prompt: body.prompt,
    });

    const printLockEnabled = body.print_lock_enabled === undefined
      ? workflowProfile.workflowMode === "catalog_fidelity"
      : Boolean(body.print_lock_enabled);
    const printFidelityLevel = normalizePrintFidelityLevel(body.print_fidelity_level, workflowProfile.workflowMode);

    const normalizedConstraints = {
      ...constraints,
      allow_pose_change: workflowProfile.shouldAllowPoseVariation,
      allow_background_change: workflowProfile.shouldAllowBackgroundVariation,
      allow_styling_variation: workflowProfile.shouldAllowSceneStyling,
      composition_mode: workflowProfile.preferredOutputStyle === "lifestyle" ? "campaign" : workflowProfile.preferredOutputStyle,
    };

    const constraintProfile = buildConstraintProfile(normalizedConstraints);

    const { data: garment, error: garmentError } = await supabase
      .from("garment_library")
      .select("*, garment_assets!garment_assets_garment_id_fkey(*)")
      .eq("id", garmentId)
      .single();

    if (garmentError || !garment) {
      return json(404, { success: false, error: garmentError?.message || "Garment not found." });
    }

    const garmentAssets = (garment.garment_assets ?? []) as GarmentAssetRecord[];
    if (!garmentAssets.length) return json(400, { success: false, error: "Selected garment has no uploaded assets." });

    const readiness = computeGarmentReadiness({
      garmentStatus: garment.status,
      assets: garmentAssets,
      primaryFrontAssetId: garment.primary_front_asset_id,
      primaryBackAssetId: garment.primary_back_asset_id,
    });

    const printReadiness = computePrintReadiness({
      garment: { printType: garment.print_type, colorway: garment.colorway },
      assets: garmentAssets,
      primaryFrontAssetId: garment.primary_front_asset_id,
      primaryBackAssetId: garment.primary_back_asset_id,
    });

    const warnings: string[] = [];
    if (readiness.readinessStatus !== "tryon_ready") warnings.push("Reference pack is incomplete; try-on fidelity may be limited.");

    let model: { id: string; display_name: string; prompt_anchor?: string | null; negative_prompt?: string | null } | null = null;
    if (modelId) {
      const { data: modelData, error: modelError } = await supabase
        .from("model_library")
        .select("id,display_name,prompt_anchor,negative_prompt")
        .eq("id", modelId)
        .single();
      if (modelError || !modelData) return json(404, { success: false, error: modelError?.message || "Model not found." });
      model = modelData;
    }

    const selectedReferences = selectGarmentReferencePack({
      assets: garmentAssets,
      primaryFrontAssetId: garment.primary_front_asset_id,
      primaryBackAssetId: garment.primary_back_asset_id,
      constraintProfile,
      workflowProfile,
      printLockEnabled,
    });

    const readinessGate = evaluateCatalogReadinessGate({ readinessSummary: readiness.referenceSummary, workflowProfile });
    const printGate = evaluatePrintGate({
      workflowMode: workflowProfile.workflowMode,
      fidelityLevel: workflowProfile.fidelityLevel,
      printLockEnabled,
      printFidelityLevel,
      printReadinessSummary: printReadiness.printReferenceSummary,
      selectedReferencePack: selectedReferences,
    });

    let effectiveWorkflowMode: WorkflowMode = workflowProfile.workflowMode;
    if (workflowProfile.workflowMode === "catalog_fidelity" && readinessGate.fallbackMode === "standard_tryon") {
      effectiveWorkflowMode = "standard_tryon";
      warnings.push("Catalog fidelity could not be fully honored; workflow degraded to standard_tryon.");
    }
    if (printGate.fallbackPrintMode) warnings.push(`Print lock degraded to ${printGate.fallbackPrintMode} due to missing print-critical references.`);
    if (printLockEnabled && printReadiness.printReadinessStatus === "print_reference_weak") warnings.push("Print Lock is enabled but print references are weak. Add close print and distribution views for better preservation.");

    if (readinessGate.reasons.length) warnings.push(...readinessGate.reasons);
    if (printGate.reasons.length) warnings.push(...printGate.reasons);

    const selectedAssetMap = new Map(garmentAssets.map((asset) => [asset.id, asset]));
    const selectedAssets = selectedReferences.selectedAssetIds
      .map((assetId) => selectedAssetMap.get(assetId))
      .filter((asset): asset is GarmentAssetRecord => Boolean(asset));
    if (!selectedAssets.length) throw new Error("Unable to assemble garment reference pack for try-on.");

    const effectiveWorkflowProfile = { ...workflowProfile, workflowMode: effectiveWorkflowMode };

    const hardPreservationRules = buildHardPreservationRules({
      workflowProfile: effectiveWorkflowProfile,
      constraintProfile,
      garment: {
        category: garment.category,
        displayName: garment.display_name,
        silhouetteNotes: garment.silhouette_notes,
        coverageNotes: garment.coverage_notes,
      },
      selectedAssets,
    });

    const structuralForbiddenTransformations = buildForbiddenTransformations({
      garmentCategory: garment.category,
      garmentName: garment.display_name,
      workflowProfile: effectiveWorkflowProfile,
      hardPreservationRules,
      readinessMissing: selectedReferences.missingIdentityCriticalReferences,
    });

    const printPreservationRules = buildPrintPreservationRules({
      workflowProfile: effectiveWorkflowProfile,
      printLockEnabled,
      printFidelityLevel: printGate.fallbackPrintMode ?? printFidelityLevel,
      printReadiness,
      garment: { printType: garment.print_type, colorway: garment.colorway },
      selectedAssets,
    });

    const printForbiddenTransformations = buildPrintForbiddenTransformations({
      rules: printPreservationRules,
      garment: { printType: garment.print_type },
      hasWeakPrintReferences: printReadiness.printReadinessStatus === "print_reference_weak",
    });

    const forbiddenTransformations = [...structuralForbiddenTransformations, ...printForbiddenTransformations];

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
        constraints: normalizedConstraints,
        workflow_mode: effectiveWorkflowMode,
        fidelity_level: workflowProfile.fidelityLevel,
        preferred_output_style: workflowProfile.preferredOutputStyle,
        print_lock_enabled: printLockEnabled,
        print_fidelity_level: printFidelityLevel,
      })
      .select("id")
      .single();

    if (jobInsertError || !createdJob) return json(500, { success: false, error: jobInsertError?.message || "Unable to create try-on job." });
    jobId = createdJob.id;
    await supabase.from("tryon_jobs").update({ status: "running" }).eq("id", jobId);

    const compiled = compileTryOnPrompt({
      subject: {
        sourceMode,
        modelName: model?.display_name,
        personAssetUrl,
        modelPromptAnchor: model?.prompt_anchor ?? null,
        modelNegativePrompt: model?.negative_prompt ?? null,
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
        assetUrls: selectedAssets.map((item) => item.public_url),
      },
      constraints: normalizedConstraints,
      constraintProfile,
      referenceBundle: selectedReferences.bundle,
      workflowProfile: effectiveWorkflowProfile,
      hardPreservationRules,
      printPreservationRules,
      forbiddenTransformations,
      prompt: body.prompt ?? null,
      negativePrompt: body.negative_prompt ?? null,
      engineMode: body.engine_mode ?? null,
    });

    await persistTryOnLineage({
      tryonJobId: jobId!,
      selectedSubjectMode: sourceMode,
      selectedGarmentAssetIds: selectedReferences.selectedAssetIds,
      selectedPrimaryFrontAssetId: selectedReferences.primaryFrontAssetId,
      selectedPrimaryBackAssetId: selectedReferences.primaryBackAssetId,
      selectedDetailAssetIds: selectedReferences.detailAssetIds,
      selectedReferenceBundle: selectedReferences.bundle,
      workflowMode: effectiveWorkflowMode,
      fidelityLevel: workflowProfile.fidelityLevel,
      printLockEnabled,
      printFidelityLevel,
      hardPreservationRules,
      printPreservationRules,
      forbiddenTransformations: structuralForbiddenTransformations,
      printForbiddenTransformations,
      readinessGateResult: readinessGate,
      printGateResult: printGate,
      orchestrationDebug: {
        referenceSelection: selectedReferences.debug,
        promptCompiler: compiled.debug,
        workflowProfile,
        readiness,
        printReadiness,
      },
    });

    const tryOnOutput = await runTryOnJob({
      backendId: body.backend,
      prompt: compiled.prompt,
      negativePrompt: compiled.negativePrompt,
      aspectRatio: body.aspect_ratio,
      adapterPayload: {
        subject: { sourceMode, modelId, personAssetUrl },
        garment: { id: garment.id, garmentCode: garment.garment_code, displayName: garment.display_name },
        selectedReferences,
        compiledPrompt: compiled.compiledPrompt,
        negativePrompt: compiled.negativePrompt,
        workflowProfile: effectiveWorkflowProfile,
        hardPreservationRules,
        printPreservationRules,
        forbiddenTransformations,
      },
    });

    const ext = fileExtensionForMime(tryOnOutput.mimeType);
    const outputPath = `try-on/${Date.now()}-${sanitizeForPath(garment.display_name)}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("brand-assets").upload(outputPath, tryOnOutput.bytes, { contentType: tryOnOutput.mimeType, upsert: false });
    if (uploadError) throw new Error(`Output upload failed: ${uploadError.message}`);

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
        reference_urls: [...(personAssetUrl ? [personAssetUrl] : []), ...selectedAssets.map((item) => item.public_url)],
        overlay_json: {
          workflow: "try_on_beta",
          backend: tryOnOutput.backendId,
          backend_model: tryOnOutput.backendModel,
          constraints: normalizedConstraints,
          readiness,
          print_readiness: printReadiness,
          readiness_gate: readinessGate,
          print_gate: printGate,
          workflow_profile: workflowProfile,
          print_lock_enabled: printLockEnabled,
          print_fidelity_level: printFidelityLevel,
          forbidden_transformations: forbiddenTransformations,
          selected_reference_ids: selectedReferences.selectedAssetIds,
        },
        generation_kind: "image",
      })
      .select("id")
      .single();

    if (generationError || !generation) throw new Error(generationError?.message || "Failed to insert generation row.");

    await supabase.from("tryon_jobs").update({
      status: "completed",
      result_generation_id: generation.id,
      backend: tryOnOutput.backendId,
      prompt: compiled.prompt,
      negative_prompt: compiled.negativePrompt,
      print_preservation_rules: printPreservationRules,
      print_gate_result: printGate,
      error_message: null,
    }).eq("id", jobId);

    await supabase.from("tryon_job_assets").insert([
      ...selectedAssets.map((asset) => ({
        tryon_job_id: jobId,
        asset_role: "garment_reference",
        file_path: asset.public_url,
        public_url: asset.public_url,
        meta: { asset_id: asset.id, detail_zone: asset.detail_zone ?? null },
      })),
      ...(personAssetUrl ? [{ tryon_job_id: jobId, asset_role: "person_reference", file_path: personAssetUrl, public_url: personAssetUrl, meta: {} }] : []),
      {
        tryon_job_id: jobId,
        asset_role: "output",
        file_path: outputPath,
        public_url: publicData.publicUrl,
        meta: { backend: tryOnOutput.backendId, backend_model: tryOnOutput.backendModel },
      },
    ]);

    return json(200, {
      success: true,
      ok: true,
      tryonJobId: jobId!,
      generationId: generation.id,
      outputUrl: publicData.publicUrl,
      backend: tryOnOutput.backendId,
      backendModel: tryOnOutput.backendModel,
      warnings,
      readiness,
      printReadiness,
      workflowProfile: effectiveWorkflowProfile,
      readinessGate,
      printGate,
      selectedReferences: {
        selectedAssetIds: selectedReferences.selectedAssetIds,
        primaryFrontAssetId: selectedReferences.primaryFrontAssetId,
        primaryBackAssetId: selectedReferences.primaryBackAssetId,
        detailAssetIds: selectedReferences.detailAssetIds,
        categoryDefiningAssetIds: selectedReferences.categoryDefiningAssetIds,
        constructionDetailAssetIds: selectedReferences.constructionDetailAssetIds,
        silhouetteCriticalAssetIds: selectedReferences.silhouetteCriticalAssetIds,
        printCriticalAssetIds: selectedReferences.printCriticalAssetIds,
        printDistributionAssetIds: selectedReferences.printDistributionAssetIds,
        printDetailAssetIds: selectedReferences.printDetailAssetIds,
        missingPrintCriticalReferences: selectedReferences.missingPrintCriticalReferences,
      },
      data: {
        tryon_job_id: jobId,
        generation_id: generation.id,
        status: "completed",
        output_url: publicData.publicUrl,
        backend: tryOnOutput.backendId,
        backend_model: tryOnOutput.backendModel,
        instruction_bundle: compiled.instructionBundle,
        warnings,
        readiness,
        print_readiness: printReadiness,
        workflow_profile: effectiveWorkflowProfile,
        readiness_gate: readinessGate,
        print_gate: printGate,
      },
    });
  } catch (error) {
    const isProviderUnavailable = error instanceof ProviderUnavailableError;
    const errorMessage = error instanceof Error ? error.message : "Unexpected try-on server error.";

    if (jobId) {
      const updatePayload: Record<string, unknown> = {
        status: "failed",
        error_message: errorMessage,
      };
      if (isProviderUnavailable) {
        updatePayload.orchestration_debug = {
          provider_error: { code: error.errorCode, message: error.message, meta: error.meta },
        };
      }

      await supabase.from("tryon_jobs").update(updatePayload).eq("id", jobId);
    }

    if (isProviderUnavailable) {
      console.error("[try-on] provider unavailable", error.meta);
      return json(503, {
        success: false,
        tryon_job_id: jobId,
        error_code: error.errorCode,
        error: error.message,
      });
    }

    return json(500, {
      success: false,
      tryon_job_id: jobId,
      error: errorMessage,
    });
  }
}
