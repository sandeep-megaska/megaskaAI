import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("video_validation_results")
      .select("*,video_generation_runs(id,generation_plan_id,status)")
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) return json(500, { success: false, error: error.message });
    return json(200, { success: true, data: data ?? [] });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      video_generation_run_id?: string;
      face_similarity_score?: number | null;
      garment_similarity_score?: number | null;
      scene_similarity_score?: number | null;
      pose_continuity_score?: number | null;
      overall_score?: number;
      decision?: "pass" | "retry" | "reject" | "manual_review";
      failure_reasons?: string[];
      validation_meta?: Record<string, unknown>;
    };

    if (!body.video_generation_run_id?.trim()) return json(400, { success: false, error: "video_generation_run_id is required." });
    if (typeof body.overall_score !== "number") return json(400, { success: false, error: "overall_score is required." });
    if (!body.decision) return json(400, { success: false, error: "decision is required." });

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("video_validation_results")
      .insert({
        video_generation_run_id: body.video_generation_run_id,
        face_similarity_score: body.face_similarity_score ?? null,
        garment_similarity_score: body.garment_similarity_score ?? null,
        scene_similarity_score: body.scene_similarity_score ?? null,
        pose_continuity_score: body.pose_continuity_score ?? null,
        overall_score: body.overall_score,
        decision: body.decision,
        failure_reasons: body.failure_reasons ?? [],
        validation_meta: body.validation_meta ?? {},
      })
      .select("*")
      .single();

    if (error) return json(400, { success: false, error: error.message });

    await supabase
      .from("video_generation_runs")
      .update({ status: "validated" })
      .eq("id", body.video_generation_run_id);

    return json(201, { success: true, data: { ...data, linked_run_status: "validated" } });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
