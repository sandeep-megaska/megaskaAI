export type CreditSummary = {
  balance: number;
  currency: "credits";
  last_updated: string;
};

export function getCreditSummary(): CreditSummary {
  const configuredBalance = Number(process.env.DEFAULT_CREDIT_BALANCE ?? "120");

  return {
    balance: Number.isFinite(configuredBalance) ? configuredBalance : 120,
    currency: "credits",
    last_updated: new Date().toISOString(),
  };
}
