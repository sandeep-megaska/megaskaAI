export type PromptBuilderProjectType = "image" | "video";
export type PromptBuilderWorkflowMode = "single_shot" | "two_shot" | null;

export type PromptBuilderInput = {
  projectType: PromptBuilderProjectType;
  workflowMode: PromptBuilderWorkflowMode;
  userIdea: string;
  environment: string;
  motionPreset: string | null;
  garmentAnchors: Record<string, string>;
  hasStartFrame: boolean;
  hasEndFrame: boolean;
  hasReferenceImages: boolean;
};

export type PromptBuilderRiskLevel = "low" | "medium" | "high";

export type PromptBuilderResult = {
  summary: string;
  riskLevel: PromptBuilderRiskLevel;
  recommendedMode: "single_shot" | "two_shot";
  imagePrompt: string;
  videoPrompt: string;
  negativeConstraints: string[];
  shotNotes: string[];
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

const PROMPT_BUILDER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "riskLevel",
    "recommendedMode",
    "imagePrompt",
    "videoPrompt",
    "negativeConstraints",
    "shotNotes",
  ],
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 240 },
    riskLevel: { type: "string", enum: ["low", "medium", "high"] },
    recommendedMode: { type: "string", enum: ["single_shot", "two_shot"] },
    imagePrompt: { type: "string", minLength: 1 },
    videoPrompt: { type: "string", minLength: 1 },
    negativeConstraints: {
      type: "array",
      items: { type: "string", minLength: 1 },
      maxItems: 8,
    },
    shotNotes: {
      type: "array",
      items: { type: "string", minLength: 1 },
      maxItems: 6,
    },
  },
} as const;

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function normalizePromptBuilderResult(value: unknown): PromptBuilderResult | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;

  const riskLevel = candidate.riskLevel;
  const recommendedMode = candidate.recommendedMode;
  if (riskLevel !== "low" && riskLevel !== "medium" && riskLevel !== "high") return null;
  if (recommendedMode !== "single_shot" && recommendedMode !== "two_shot") return null;

  const summary = asString(candidate.summary).trim();
  const imagePrompt = asString(candidate.imagePrompt).trim();
  const videoPrompt = asString(candidate.videoPrompt).trim();

  if (!summary || !imagePrompt || !videoPrompt) return null;

  return {
    summary,
    riskLevel,
    recommendedMode,
    imagePrompt,
    videoPrompt,
    negativeConstraints: asStringArray(candidate.negativeConstraints).slice(0, 8),
    shotNotes: asStringArray(candidate.shotNotes).slice(0, 6),
  };
}

function buildSystemInstructions() {
  return [
    "You are Megaska AI Prompt Builder.",
    "Return only valid JSON that matches the schema.",
    "Goal: convert rough intent into provider-safe practical prompts for image and video generation.",
    "Prioritize concise prompts that are directly usable by generation models.",
    "Use anti-hallucination language: avoid unknown logos/prints/objects not described.",
    "Enforce garment continuity and environment continuity.",
    "For risky motion turns, prefer smaller transitions and recommend two_shot when needed.",
    "Even if risk is high, still return usable imagePrompt and videoPrompt.",
    "negativeConstraints should include concrete guardrails to avoid drift/artifacts.",
    "shotNotes should be practical execution notes, especially for continuity-safe clips.",
  ].join("\n");
}

function buildUserInput(input: PromptBuilderInput) {
  return JSON.stringify(input);
}

type OpenAIDebugInfo = {
  model: string;
  responseId: string | null;
  requestId: string | null;
  status: string | null;
  finishReason: string | null;
  refusal: string | null;
  rawText: string;
  hasRawText: boolean;
  parsedJsonExists: boolean;
  schemaParseFailed: boolean;
  isTruncated: boolean;
  isContentFiltered: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function collectOutputTextAndRefusal(payload: Record<string, unknown>) {
  const rawTextParts: string[] = [];
  const refusalParts: string[] = [];
  const output = payload.output;
  if (!Array.isArray(output)) return { rawText: "", refusal: null as string | null };

  for (const item of output) {
    const message = asRecord(item);
    if (!message) continue;
    const content = message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      const part = asRecord(block);
      if (!part) continue;
      if (part.type === "output_text" && typeof part.text === "string" && part.text.trim().length > 0) {
        rawTextParts.push(part.text);
      }
      if (part.type === "refusal" && typeof part.refusal === "string" && part.refusal.trim().length > 0) {
        refusalParts.push(part.refusal);
      }
    }
  }

  return {
    rawText: rawTextParts.join("\n").trim(),
    refusal: refusalParts.length ? refusalParts.join("\n").trim() : null,
  };
}

function extractPrimaryOutputInfo(payload: Record<string, unknown>) {
  const output = Array.isArray(payload.output) ? payload.output : [];
  const first = asRecord(output[0]);
  const firstStatus = typeof first?.status === "string" ? first.status : null;
  const firstFinishReason = typeof first?.finish_reason === "string" ? first.finish_reason : null;
  return { firstStatus, firstFinishReason };
}

export async function generatePromptBuilderResult(input: PromptBuilderInput): Promise<PromptBuilderResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const model = process.env.OPENAI_PROMPT_BUILDER_MODEL ?? "gpt-4.1-mini";

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: buildSystemInstructions() }] },
        { role: "user", content: [{ type: "input_text", text: buildUserInput(input) }] },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "megaska_prompt_builder_v1",
          strict: true,
          schema: PROMPT_BUILDER_SCHEMA,
        },
      },
    }),
  });

  const payload = (await response.json()) as Record<string, unknown>;
  const requestId = response.headers.get("x-request-id");

  const { rawText, refusal } = collectOutputTextAndRefusal(payload);
  const outputText = typeof payload.output_text === "string" && payload.output_text.trim().length > 0 ? payload.output_text.trim() : rawText;
  const { firstStatus, firstFinishReason } = extractPrimaryOutputInfo(payload);
  const incomplete = asRecord(payload.incomplete_details);
  const incompleteReason = typeof incomplete?.reason === "string" ? incomplete.reason : null;
  const finishReason = firstFinishReason ?? incompleteReason;
  const status = typeof payload.status === "string" ? payload.status : firstStatus;

  const debugInfo: OpenAIDebugInfo = {
    model,
    responseId: typeof payload.id === "string" ? payload.id : null,
    requestId,
    status,
    finishReason,
    refusal,
    rawText: outputText,
    hasRawText: outputText.length > 0,
    parsedJsonExists: false,
    schemaParseFailed: false,
    isTruncated:
      finishReason === "length" ||
      finishReason === "max_output_tokens" ||
      status === "incomplete" ||
      incompleteReason === "max_output_tokens",
    isContentFiltered:
      finishReason === "content_filter" ||
      finishReason === "content_filtered" ||
      refusal !== null,
  };

  if (!response.ok) {
    console.error("[prompt-builder] OpenAI API error", {
      debug: debugInfo,
      httpStatus: response.status,
      payload,
    });
    const message =
      typeof payload.error === "object" && payload.error && "message" in payload.error
        ? String((payload.error as { message?: unknown }).message ?? "OpenAI request failed.")
        : "OpenAI request failed.";
    throw new Error(message);
  }

  if (!outputText) {
    console.error("[prompt-builder] OpenAI response had no text", {
      debug: debugInfo,
      payload,
    });
    throw new Error(
      `OpenAI response did not include usable text. hasRawText=false schemaParseFailed=false finishReason=${finishReason ?? "unknown"} status=${status ?? "unknown"} refusal=${refusal ? "yes" : "no"}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
    debugInfo.parsedJsonExists = true;
  } catch {
    console.error("[prompt-builder] OpenAI returned non-JSON text", {
      debug: debugInfo,
      payload,
    });
    throw new Error(
      `OpenAI returned non-JSON output. hasRawText=true schemaParseFailed=true finishReason=${finishReason ?? "unknown"} status=${status ?? "unknown"} refusal=${refusal ? "yes" : "no"}`,
    );
  }

  const normalized = normalizePromptBuilderResult(parsed);
  if (!normalized) {
    debugInfo.schemaParseFailed = true;
    console.error("[prompt-builder] OpenAI JSON failed Prompt Builder schema", {
      debug: debugInfo,
      parsed,
      payload,
    });
    throw new Error(
      `OpenAI JSON did not match Prompt Builder schema. hasRawText=true schemaParseFailed=true finishReason=${finishReason ?? "unknown"} status=${status ?? "unknown"} truncated=${debugInfo.isTruncated} contentFiltered=${debugInfo.isContentFiltered}`,
    );
  }

  console.info("[prompt-builder] OpenAI response parsed", {
    debug: { ...debugInfo, parsedJsonExists: true, schemaParseFailed: false },
  });

  return normalized;
}
