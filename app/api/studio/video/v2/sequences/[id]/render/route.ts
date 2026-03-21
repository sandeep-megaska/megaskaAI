import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { buildExportPreparationView, buildSequenceTimelineView } from "@/lib/video/v2/sequences";
import { renderSequence } from "@/lib/video/v2/render";
import type { SequenceTimelineClip, VideoSequence } from "@/lib/video/v2/types";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function parseRunMeta(runMeta: unknown): Record<string, unknown> {
  if (!runMeta || typeof runMeta !== "object" || Array.isArray(runMeta)) return {};
  return runMeta as Record<string, unknown>;
}

function mergeSequenceMeta(base: unknown, patch: Record<string, unknown>) {
  const current = base && typeof base === "object" && !Array.isArray(base) ? (base as Record<string, unknown>) : {};
  return {
    ...current,
    ...patch,
  };
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = new Date().toISOString();

  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();

    const { data: sequence, error: sequenceError } = await supabase
      .from("video_sequences")
      .select("id,project_id,sequence_name,status,output_asset_id,sequence_meta,created_at,updated_at")
      .eq("id", id)
      .single();

    if (sequenceError || !sequence) return json(404, { success: false, error: sequenceError?.message ?? "Sequence not found." });

    const { data: items, error: itemsError } = await supabase
      .from("video_sequence_items")
      .select("id,sequence_id,run_id,order_index,is_active,created_at")
      .eq("sequence_id", id)
      .eq("is_active", true)
      .order("order_index", { ascending: true });

    if (itemsError) return json(500, { success: false, error: itemsError.message });

    const runIds = (items ?? []).map((item) => item.run_id);
    const { data: runs, error: runsError } = runIds.length
      ? await supabase.from("video_generation_runs").select("id,mode_selected,provider_used,provider_model,run_meta,output_generation_id").in("id", runIds)
      : { data: [], error: null };

    if (runsError) return json(500, { success: false, error: runsError.message });

    const outputIds = (runs ?? []).map((run) => run.output_generation_id).filter(Boolean);
    const { data: outputs } = outputIds.length
      ? await supabase.from("generations").select("id,asset_url,url,thumbnail_url").in("id", outputIds)
      : { data: [] as Array<{ id: string; asset_url: string | null; url: string | null; thumbnail_url: string | null }> };

    const runMap = new Map((runs ?? []).map((run) => [run.id, run]));
    const outputMap = new Map((outputs ?? []).map((output) => [output.id, output]));

    const clips: SequenceTimelineClip[] = (items ?? []).map((item) => {
      const run = runMap.get(item.run_id);
      const runMeta = parseRunMeta(run?.run_meta);
      const requestSnapshot =
        runMeta.request_payload_snapshot && typeof runMeta.request_payload_snapshot === "object"
          ? (runMeta.request_payload_snapshot as Record<string, unknown>)
          : {};
      const output = run?.output_generation_id ? outputMap.get(run.output_generation_id) : null;
      return {
        item_id: item.id,
        run_id: item.run_id,
        order_index: item.order_index,
        output_url: output?.asset_url ?? output?.url ?? null,
        thumbnail_url: output?.thumbnail_url ?? null,
        duration_seconds: typeof requestSnapshot.duration_seconds === "number" ? requestSnapshot.duration_seconds : null,
        mode_selected: String(run?.mode_selected ?? "unknown"),
        provider_model: run?.provider_model ?? null,
        provider_used: run?.provider_used ?? null,
        validation_score: null,
        accepted_for_sequence: Boolean(runMeta.accepted_for_sequence),
        aspect_ratio: typeof requestSnapshot.aspect_ratio === "string" ? requestSnapshot.aspect_ratio : null,
        selected_pack_id: typeof runMeta.selected_pack_id === "string" ? runMeta.selected_pack_id : null,
        lineage: {
          extension_from_run_id: typeof runMeta.source_run_id === "string" ? runMeta.source_run_id : null,
          branched_from_run_id: typeof runMeta.branched_from_run_id === "string" ? runMeta.branched_from_run_id : null,
        },
      };
    });

    const timeline = buildSequenceTimelineView(sequence as VideoSequence, clips);
    const exportPreparation = buildExportPreparationView(timeline);

    if (!exportPreparation.ready_for_export) {
      return json(400, {
        success: false,
        error: "Sequence is not ready for export.",
        data: { export_preparation: exportPreparation },
      });
    }


    const missingOutputClip = exportPreparation.clips.find((clip) => !clip.output_url);
    if (missingOutputClip) {
      return json(400, { success: false, error: "Missing output video in sequence" });
    }

    await supabase
      .from("video_sequences")
      .update({
        status: "rendering",
        sequence_meta: mergeSequenceMeta(sequence.sequence_meta, {
          render_started_at: startedAt,
          render_completed_at: null,
          render_duration: null,
          render_error: null,
        }),
      })
      .eq("id", id);

    const renderableClips = exportPreparation.clips.map((clip) => ({
      run_id: clip.run_id,
      order_index: clip.order_index,
      output_url: clip.output_url as string,
    }));

    const result = await renderSequence(supabase, id, renderableClips);

    await supabase
      .from("video_sequences")
      .update({
        status: "exported",
        output_asset_id: result.output_asset_id,
        sequence_meta: mergeSequenceMeta(sequence.sequence_meta, {
          ...result.metadata,
          render_error: null,
        }),
      })
      .eq("id", id);

    return json(200, { success: true, data: result });
  } catch (error) {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();
    const renderError = error instanceof Error ? error.message : "Rendering failed — check clips";

    const { data: sequence } = await supabase.from("video_sequences").select("sequence_meta").eq("id", id).maybeSingle();

    await supabase
      .from("video_sequences")
      .update({
        status: "failed",
        sequence_meta: mergeSequenceMeta(sequence?.sequence_meta, {
          render_started_at: startedAt,
          render_completed_at: new Date().toISOString(),
          render_error: renderError,
        }),
      })
      .eq("id", id);

    return json(500, { success: false, error: renderError });
  }
}
