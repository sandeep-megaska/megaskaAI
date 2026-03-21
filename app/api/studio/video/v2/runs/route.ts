import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      generation_plan_id?: string;
      output_generation_id?: string;
      mode_selected?: string;
      status?: string;
      provider_used?: string;
      provider_model?: string;
      run_meta?: Record<string, unknown>;
    };

    if (!body.generation_plan_id?.trim()) return json(400, { success: false, error: "generation_plan_id is required." });
    if (!body.mode_selected?.trim()) return json(400, { success: false, error: "mode_selected is required." });

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("video_generation_runs")
      .insert({
        generation_plan_id: body.generation_plan_id,
        output_generation_id: body.output_generation_id ?? null,
        mode_selected: body.mode_selected,
        status: body.status ?? "queued",
        provider_used: body.provider_used ?? null,
        provider_model: body.provider_model ?? null,
        run_meta: body.run_meta ?? {},
      })
      .select("*")
      .single();

    if (error) return json(400, { success: false, error: error.message });
    return json(201, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
