import { GoogleAuth } from "google-auth-library";
import type { GoogleBillingExportConfig } from "@/lib/billing/billingConfig";

export type BillingExportQueryResult = {
  thisMonthCost: number | null;
  todayCost: number | null;
  currency: string | null;
  lastUpdatedAt: string | null;
};

type QueryRow = {
  f?: Array<{ v?: string | number | null } | null>;
};

type BigQueryResponse = {
  rows?: QueryRow[];
  jobComplete?: boolean;
};

function assertIdentifier(name: string, value: string) {
  if (!/^[A-Za-z0-9_\-]+$/.test(value)) {
    throw new Error(`Invalid ${name} value.`);
  }
}

function toMoney(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}

function getWindowStartDates(now = new Date()) {
  return {
    monthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString(),
    todayStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)).toISOString(),
    tomorrowStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)).toISOString(),
  };
}

function rowValue(row: QueryRow | undefined, index: number): unknown {
  return row?.f?.[index]?.v ?? null;
}

export async function queryBillingExportSummary(config: GoogleBillingExportConfig): Promise<BillingExportQueryResult> {
  assertIdentifier("project", config.projectId);
  assertIdentifier("dataset", config.dataset);
  assertIdentifier("table", config.table);

  const { monthStart, todayStart, tomorrowStart } = getWindowStartDates();
  const tableRef = `\`${config.projectId}.${config.dataset}.${config.table}\``;

  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/bigquery.readonly"],
    projectId: config.projectId,
  });

  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = tokenResponse.token;

  if (!accessToken) {
    throw new Error("Missing Google access token for BigQuery query.");
  }

  const response = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${config.projectId}/queries`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      useLegacySql: false,
      timeoutMs: 10000,
      query: `
        WITH base AS (
          SELECT
            DATE(usage_start_time) AS usage_date,
            SAFE_CAST(cost AS FLOAT64) + IFNULL((SELECT SUM(SAFE_CAST(c.amount AS FLOAT64)) FROM UNNEST(IFNULL(credits, [])) c), 0.0) AS net_cost,
            currency,
            export_time,
            usage_end_time,
            usage_start_time
          FROM ${tableRef}
          WHERE usage_start_time >= TIMESTAMP(@month_start)
            AND usage_start_time < TIMESTAMP(@tomorrow_start)
            AND (@billing_account_id IS NULL OR billing_account_id = @billing_account_id)
        )
        SELECT
          SUM(IF(usage_date >= DATE(TIMESTAMP(@month_start)), net_cost, 0.0)) AS this_month_cost,
          SUM(IF(usage_date = DATE(TIMESTAMP(@today_start)), net_cost, 0.0)) AS today_cost,
          ANY_VALUE(currency) AS currency,
          MAX(COALESCE(export_time, usage_end_time, usage_start_time)) AS last_updated_at
        FROM base
      `,
      parameterMode: "NAMED",
      queryParameters: [
        {
          name: "month_start",
          parameterType: { type: "STRING" },
          parameterValue: { value: monthStart },
        },
        {
          name: "today_start",
          parameterType: { type: "STRING" },
          parameterValue: { value: todayStart },
        },
        {
          name: "tomorrow_start",
          parameterType: { type: "STRING" },
          parameterValue: { value: tomorrowStart },
        },
        {
          name: "billing_account_id",
          parameterType: { type: "STRING" },
          parameterValue: { value: config.billingAccountId },
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BigQuery query failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as BigQueryResponse;
  if (!payload.jobComplete) {
    throw new Error("BigQuery query did not complete in time.");
  }

  const row = payload.rows?.[0];

  return {
    thisMonthCost: toMoney(rowValue(row, 0)),
    todayCost: toMoney(rowValue(row, 1)),
    currency: (rowValue(row, 2) as string | null) ?? null,
    lastUpdatedAt: (rowValue(row, 3) as string | null) ?? null,
  };
}
