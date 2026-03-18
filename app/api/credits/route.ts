import { NextResponse } from "next/server";
import { summarizeGeminiEstimatedCosts, type GeminiCostGenerationRecord } from "@/lib/billing/geminiCost";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("generations")
      .select("id,created_at,aspect_ratio,generation_kind,media_type,overlay_json")
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) {
      console.error("[credits] failed to load generation history", error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const summary = summarizeGeminiEstimatedCosts((data ?? []) as GeminiCostGenerationRecord[]);

    return NextResponse.json({
      success: true,
      data: {
        estimated_last_gen_usd: summary.estimatedLastGenUsd,
        estimated_today_usd: summary.estimatedTodayUsd,
        estimated_this_month_usd: summary.estimatedThisMonthUsd,
        last_generated_at: summary.lastGeneratedAt,
        requested_backend_model: summary.requestedBackendModel,
        actual_backend_model: summary.actualBackendModel,
        fallback_applied: summary.fallbackApplied,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to calculate Gemini estimated spend.",
      },
      { status: 500 },
    );
  }
}
