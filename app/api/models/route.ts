import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseAdminClient();
    const includeAll = new URL(request.url).searchParams.get("include_all") === "1";

    const baseQuery = supabase
      .from("model_library")
      .select("*, model_assets(*)")
      .order("created_at", { ascending: false });

    const query = includeAll ? baseQuery : baseQuery.eq("status", "active");
    const { data, error } = await query;

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

    if (!body.model_code || !body.display_name || !body.category) {
      return json(400, { success: false, error: "model_code, display_name, and category are required." });
    }

    const { data, error } = await supabase
      .from("model_library")
      .insert({
        model_code: body.model_code,
        display_name: body.display_name,
        category: body.category,
        status: body.status ?? "active",
        prompt_anchor: body.prompt_anchor ?? null,
        negative_prompt: body.negative_prompt ?? null,
        notes: body.notes ?? null,
      })
      .select("*")
      .single();

    if (error) return json(400, { success: false, error: error.message });
    return json(201, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
