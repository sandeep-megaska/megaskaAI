import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

const ratingValues = new Set(["approved", "usable", "poor", "rejected"]);

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseAdminClient();
    const url = new URL(request.url);
    const tryonJobId = url.searchParams.get("tryon_job_id");
    const generationId = url.searchParams.get("generation_id");

    let query = supabase.from("tryon_output_reviews").select("*").order("reviewed_at", { ascending: false }).limit(20);
    if (tryonJobId) query = query.eq("tryon_job_id", tryonJobId);
    if (generationId) query = query.eq("generation_id", generationId);

    const { data, error } = await query;
    if (error) return json(400, { success: false, error: error.message });

    return json(200, { success: true, data: data ?? [] });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    const tryonJobId = body.tryon_job_id ? String(body.tryon_job_id) : null;
    if (!tryonJobId) return json(400, { success: false, error: "tryon_job_id is required." });

    const candidateRatings = [body.overall_rating, body.garment_fidelity_rating, body.subject_rating, body.pose_background_rating]
      .filter((value): value is string => typeof value === "string");

    if (candidateRatings.some((value) => !ratingValues.has(value))) {
      return json(400, { success: false, error: "Invalid rating value. Use approved | usable | poor | rejected." });
    }

    const payload = {
      tryon_job_id: tryonJobId,
      generation_id: body.generation_id ? String(body.generation_id) : null,
      overall_rating: body.overall_rating ?? null,
      garment_fidelity_rating: body.garment_fidelity_rating ?? null,
      subject_rating: body.subject_rating ?? null,
      pose_background_rating: body.pose_background_rating ?? null,
      issue_tags: Array.isArray(body.issue_tags) ? body.issue_tags.map((item: unknown) => String(item)) : [],
      review_notes: body.review_notes ? String(body.review_notes) : null,
      reviewed_at: new Date().toISOString(),
    };

    let existingQuery = supabase
      .from("tryon_output_reviews")
      .select("id")
      .eq("tryon_job_id", tryonJobId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (payload.generation_id) existingQuery = existingQuery.eq("generation_id", payload.generation_id);

    const { data: existing } = await existingQuery.maybeSingle();

    if (existing?.id) {
      const { data, error } = await supabase
        .from("tryon_output_reviews")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error) return json(400, { success: false, error: error.message });
      return json(200, { success: true, data });
    }

    const { data, error } = await supabase
      .from("tryon_output_reviews")
      .insert(payload)
      .select("*")
      .single();

    if (error) return json(400, { success: false, error: error.message });

    return json(201, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
