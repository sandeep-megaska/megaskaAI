import { NextResponse } from "next/server";
import { summarizeGeminiEstimatedCosts, type GeminiCostGenerationRecord } from "@/lib/billing/geminiCost";
import { getGoogleBillingSpendSummary } from "@/lib/billing/getGoogleBillingSpendSummary";
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

    const estimated = summarizeGeminiEstimatedCosts((data ?? []) as GeminiCostGenerationRecord[]);
    const googleBilling = await getGoogleBillingSpendSummary();

    return NextResponse.json({
      success: true,
      data: {
        google_billing: {
          status: googleBilling.status,
          source: googleBilling.source,
          currency: googleBilling.currency,
          this_month_cost: googleBilling.thisMonthCost,
          today_cost: googleBilling.todayCost,
          last_updated_at: googleBilling.lastUpdatedAt,
          message: googleBilling.message,
        },
        estimated_last_generation_usd: estimated.estimatedLastGenUsd,
        estimated_today_usd: estimated.estimatedTodayUsd,
        estimated_this_month_usd: estimated.estimatedThisMonthUsd,
        last_generated_at: estimated.lastGeneratedAt,
        requested_backend_model: estimated.requestedBackendModel,
        actual_backend_model: estimated.actualBackendModel,
        fallback_applied: estimated.fallbackApplied,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load spend summary.",
      },
      { status: 500 },
    );
  }
}
