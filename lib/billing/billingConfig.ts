export type GoogleBillingExportConfig = {
  projectId: string;
  dataset: string;
  table: string;
  billingAccountId: string | null;
};

export type GoogleBillingExportConfigState =
  | { configured: true; config: GoogleBillingExportConfig }
  | { configured: false; missing: string[] };

function readTrimmedEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function getGoogleBillingExportConfig(): GoogleBillingExportConfigState {
  const projectId = readTrimmedEnv("GOOGLE_BILLING_BQ_PROJECT_ID");
  const dataset = readTrimmedEnv("GOOGLE_BILLING_BQ_DATASET");
  const table = readTrimmedEnv("GOOGLE_BILLING_BQ_TABLE");
  const billingAccountId = readTrimmedEnv("GOOGLE_BILLING_ACCOUNT_ID") ?? null;

  const missing: string[] = [];
  if (!projectId) missing.push("GOOGLE_BILLING_BQ_PROJECT_ID");
  if (!dataset) missing.push("GOOGLE_BILLING_BQ_DATASET");
  if (!table) missing.push("GOOGLE_BILLING_BQ_TABLE");

  if (missing.length > 0) {
    return { configured: false, missing };
  }

  return {
    configured: true,
    config: {
      projectId: projectId!,
      dataset: dataset!,
      table: table!,
      billingAccountId,
    },
  };
}
