import { unstable_cache } from "next/cache";
import { getGoogleBillingExportConfig } from "@/lib/billing/billingConfig";
import { queryBillingExportSummary } from "@/lib/billing/queryBillingExport";

export type GoogleBillingSpendSummary = {
  status: "ok" | "not_configured" | "error" | "no_data";
  source: "google-billing-bigquery";
  currency: string | null;
  thisMonthCost: number | null;
  todayCost: number | null;
  lastUpdatedAt: string | null;
  message: string | null;
};

const loadGoogleBillingSpendSummary = unstable_cache(
  async (): Promise<GoogleBillingSpendSummary> => {
    const configState = getGoogleBillingExportConfig();

    if (!configState.configured) {
      return {
        status: "not_configured",
        source: "google-billing-bigquery",
        currency: null,
        thisMonthCost: null,
        todayCost: null,
        lastUpdatedAt: null,
        message: `Missing billing config: ${configState.missing.join(", ")}`,
      };
    }

    try {
      const summary = await queryBillingExportSummary(configState.config);
      const hasAnyCost = summary.thisMonthCost !== null || summary.todayCost !== null;
      const hasRows = hasAnyCost || summary.lastUpdatedAt !== null;

      if (!hasRows) {
        return {
          status: "no_data",
          source: "google-billing-bigquery",
          currency: summary.currency,
          thisMonthCost: null,
          todayCost: null,
          lastUpdatedAt: null,
          message: "No billing export rows available yet.",
        };
      }

      return {
        status: "ok",
        source: "google-billing-bigquery",
        currency: summary.currency ?? "USD",
        thisMonthCost: summary.thisMonthCost,
        todayCost: summary.todayCost,
        lastUpdatedAt: summary.lastUpdatedAt,
        message: null,
      };
    } catch (error) {
      console.error("[billing] Failed to query Google billing export", error);
      return {
        status: "error",
        source: "google-billing-bigquery",
        currency: null,
        thisMonthCost: null,
        todayCost: null,
        lastUpdatedAt: null,
        message: "Unable to load Google billing summary.",
      };
    }
  },
  ["google-billing-spend-summary"],
  { revalidate: 300 },
);

export function getGoogleBillingSpendSummary() {
  return loadGoogleBillingSpendSummary();
}
