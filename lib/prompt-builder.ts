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

export async function generatePromptBuilderResult(input: PromptBuilderInput): Promise<PromptBuilderResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_PROMPT_BUILDER_MODEL ?? "gpt-4.1-mini",
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

  if (!response.ok) {
    const message =
      typeof payload.error === "object" && payload.error && "message" in payload.error
        ? String((payload.error as { message?: unknown }).message ?? "OpenAI request failed.")
        : "OpenAI request failed.";
    throw new Error(message);
  }

  const outputText = typeof payload.output_text === "string" ? payload.output_text : "";
  if (!outputText) {
    throw new Error("OpenAI returned an empty response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error("OpenAI returned invalid JSON.");
  }

  const normalized = normalizePromptBuilderResult(parsed);
  if (!normalized) {
    throw new Error("OpenAI returned JSON that does not match Prompt Builder schema.");
  }

  return normalized;
}
