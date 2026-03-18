export type ProviderErrorMeta = {
  provider: "gemini";
  status?: number;
  code?: string;
  details?: unknown;
};

export class ProviderUnavailableError extends Error {
  errorCode = "provider_unavailable" as const;
  meta: ProviderErrorMeta;

  constructor(message: string, meta: ProviderErrorMeta) {
    super(message);
    this.name = "ProviderUnavailableError";
    this.meta = meta;
  }
}

export class ProviderInvalidArgumentError extends Error {
  errorCode = "provider_invalid_argument" as const;
  meta: ProviderErrorMeta;

  constructor(message: string, meta: ProviderErrorMeta) {
    super(message);
    this.name = "ProviderInvalidArgumentError";
    this.meta = meta;
  }
}

function extractStatus(error: unknown) {
  const maybe = error as { status?: number; code?: number; response?: { status?: number } };
  return maybe?.status ?? maybe?.code ?? maybe?.response?.status;
}

function extractCode(error: unknown) {
  const maybe = error as { error?: { status?: string; code?: string }; statusText?: string; message?: string };
  return maybe?.error?.status ?? maybe?.error?.code ?? maybe?.statusText;
}

export function isGeminiUnavailableError(error: unknown) {
  const status = extractStatus(error);
  const code = String(extractCode(error) ?? "").toUpperCase();
  const message = String((error as { message?: string })?.message ?? "").toUpperCase();
  return (
    status === 429 ||
    status === 503 ||
    code.includes("RESOURCE_EXHAUSTED") ||
    code.includes("RATE_LIMIT") ||
    code.includes("UNAVAILABLE") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("RATE LIMIT") ||
    message.includes("RATE_LIMIT") ||
    message.includes("UNAVAILABLE") ||
    message.includes("429") ||
    message.includes("503")
  );
}

export function isGeminiInvalidArgumentError(error: unknown) {
  const status = extractStatus(error);
  const code = String(extractCode(error) ?? "").toUpperCase();
  const message = String((error as { message?: string })?.message ?? "").toUpperCase();
  return status === 400 || code.includes("INVALID_ARGUMENT") || message.includes("INVALID_ARGUMENT");
}

export function mapGeminiProviderError(error: unknown): never {
  if (isGeminiInvalidArgumentError(error)) {
    throw new ProviderInvalidArgumentError("Provider rejected one or more generation parameters.", {
      provider: "gemini",
      status: extractStatus(error),
      code: extractCode(error),
      details: error,
    });
  }

  if (isGeminiUnavailableError(error)) {
    throw new ProviderUnavailableError(
      "The image service is temporarily unavailable. Please try again in a moment.",
      {
        provider: "gemini",
        status: extractStatus(error),
        code: extractCode(error),
        details: error,
      },
    );
  }

  throw error;
}
