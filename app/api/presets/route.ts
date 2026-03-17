import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.from("brand_presets").select("*").order("created_at", { ascending: false });
    if (error) return json(500, { success: false, error: error.message });
    return json(200, { success: true, data: data ?? [] });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("brand_presets")
      .insert({
        name: body.name,
        prompt_template: body.prompt_template ?? null,
        aspect_ratio: body.aspect_ratio ?? "1:1",
        overlay_defaults: body.overlay_defaults ?? {},
      })
      .select("*")
      .single();

    if (error) return json(400, { success: false, error: error.message });
    return json(201, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
