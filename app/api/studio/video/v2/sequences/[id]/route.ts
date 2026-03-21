import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { buildExportPreparationView, buildSequenceTimelineView } from "@/lib/video/v2/sequences";
import type { SequenceTimelineClip, VideoSequence } from "@/lib/video/v2/types";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function parseRunMeta(runMeta: unknown): Record<string, unknown> {
  if (!runMeta || typeof runMeta !== "object" || Array.isArray(runMeta)) return {};
  return runMeta as Record<string, unknown>;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();

    const { data: sequence, error: sequenceError } = await supabase
      .from("video_sequences")
      .select("id,project_id,sequence_name,status,created_at,updated_at")
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
      ? await supabase
          .from("video_generation_runs")
          .select("id,mode_selected,provider_used,provider_model,run_meta,output_generation_id")
          .in("id", runIds)
      : { data: [], error: null };

    if (runsError) return json(500, { success: false, error: runsError.message });

    const outputIds = (runs ?? []).map((run) => run.output_generation_id).filter(Boolean);
    const { data: outputs } = outputIds.length
      ? await supabase.from("generations").select("id,asset_url,url,thumbnail_url").in("id", outputIds)
      : { data: [] as Array<{ id: string; asset_url: string | null; url: string | null; thumbnail_url: string | null }> };

    const { data: validations } = runIds.length
      ? await supabase
          .from("video_validation_results")
          .select("video_generation_run_id,overall_score,created_at")
          .in("video_generation_run_id", runIds)
          .order("created_at", { ascending: false })
      : { data: [] as Array<{ video_generation_run_id: string; overall_score: number; created_at: string }> };

    const runMap = new Map((runs ?? []).map((run) => [run.id, run]));
    const outputMap = new Map((outputs ?? []).map((output) => [output.id, output]));
    const validationMap = new Map<string, number>();
    for (const validation of validations ?? []) {
      if (!validationMap.has(validation.video_generation_run_id)) {
        validationMap.set(validation.video_generation_run_id, Number(validation.overall_score ?? 0));
      }
    }

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
        validation_score: validationMap.get(item.run_id) ?? null,
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

    return json(200, {
      success: true,
      data: {
        timeline,
        export_preparation: exportPreparation,
      },
    });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
