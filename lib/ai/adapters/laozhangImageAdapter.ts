import { type StudioAspectRatio } from "@/lib/studio/aspectRatios";

type LaoZhangImageInput = {
  model?: string;
  prompt: string;
  aspectRatio?: StudioAspectRatio;
  referenceUrls?: string[];
  timeoutMs?: number;
};

type LaoZhangImageOutput = {
  bytes: Buffer;
  mimeType: string;
  model: string;
};

type OpenAICompatibleResponse = {
  model?: string;
  data?: Array<{ b64_json?: string; url?: string; mime_type?: string }>;
  output?: Array<{
    content?: Array<{
      type?: string;
      image_url?: string;
      b64_json?: string;
      mime_type?: string;
    }>;
  }>;
  choices?: Array<{
    message?: {
      content?: Array<{
        type?: string;
        image_url?: { url?: string };
      }> | string;
    };
  }>;
};

const DEFAULT_BASE_URL = "https://api.laozhang.ai/v1";
const DEFAULT_MODEL = "gemini-3-pro-image-preview";

function resolveLaoZhangConfig() {
  const apiKey = process.env.LAOZHANG_API_KEY?.trim();
  const baseUrl = (process.env.LAOZHANG_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.LAOZHANG_IMAGE_MODEL?.trim() || DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error("Missing LAOZHANG_API_KEY environment variable.");
  }

  return { apiKey, baseUrl, model };
}

function inferMimeTypeFromDataUrl(url: string) {
  const match = url.match(/^data:([^;,]+);base64,/i);
  return match?.[1]?.trim() || "image/png";
}

async function fetchImageFromUrl(url: string) {
  if (url.startsWith("data:")) {
    const [header, base64] = url.split(",", 2);
    if (!base64) throw new Error("LaoZhang returned an invalid data URL image.");
    return {
      bytes: Buffer.from(base64, "base64"),
      mimeType: inferMimeTypeFromDataUrl(header),
    };
  }

  const imageResponse = await fetch(url);
  if (!imageResponse.ok) {
    throw new Error(`LaoZhang image URL fetch failed (${imageResponse.status}).`);
  }

  return {
    bytes: Buffer.from(await imageResponse.arrayBuffer()),
    mimeType: imageResponse.headers.get("content-type")?.split(";")[0] ?? "image/png",
  };
}

function extractImagePayload(payload: OpenAICompatibleResponse) {
  const b64FromData = payload.data?.find((item) => typeof item.b64_json === "string")?.b64_json;
  if (b64FromData) {
    const mimeType = payload.data?.find((item) => item.b64_json)?.mime_type ?? "image/png";
    return { type: "base64" as const, value: b64FromData, mimeType };
  }

  const urlFromData = payload.data?.find((item) => typeof item.url === "string")?.url;
  if (urlFromData) {
    return { type: "url" as const, value: urlFromData };
  }

  const outputPart = payload.output
    ?.flatMap((entry) => entry.content ?? [])
    .find((part) => typeof part.b64_json === "string" || typeof part.image_url === "string");

  if (outputPart?.b64_json) {
    return { type: "base64" as const, value: outputPart.b64_json, mimeType: outputPart.mime_type ?? "image/png" };
  }

  if (outputPart?.image_url) {
    return { type: "url" as const, value: outputPart.image_url };
  }

  const messageContent = payload.choices?.[0]?.message?.content;
  if (Array.isArray(messageContent)) {
    const imagePart = messageContent.find((part) => part.type === "image_url" && part.image_url?.url);
    if (imagePart?.image_url?.url) {
      return { type: "url" as const, value: imagePart.image_url.url };
    }
  }

  return null;
}

function buildContentParts(prompt: string, aspectRatio?: StudioAspectRatio, referenceUrls?: string[]) {
  const parts: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: aspectRatio ? `${prompt}\n\nPreferred aspect ratio: ${aspectRatio}.` : prompt,
    },
  ];

  for (const url of (referenceUrls ?? []).slice(0, 6)) {
    if (!url) continue;
    parts.push({ type: "image_url", image_url: { url } });
  }

  return parts;
}

export async function runLaoZhangImageGeneration(input: LaoZhangImageInput): Promise<LaoZhangImageOutput> {
  const config = resolveLaoZhangConfig();
  const model = input.model ?? config.model;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 45_000);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: buildContentParts(input.prompt, input.aspectRatio, input.referenceUrls),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      throw new Error(`LaoZhang request failed (${response.status}): ${raw.slice(0, 240) || "No response body."}`);
    }

    const payload = (await response.json()) as OpenAICompatibleResponse;
    const imagePayload = extractImagePayload(payload);
    if (!imagePayload) {
      throw new Error("LaoZhang image generation returned no image output.");
    }

    if (imagePayload.type === "base64") {
      return {
        bytes: Buffer.from(imagePayload.value, "base64"),
        mimeType: imagePayload.mimeType,
        model: payload.model ?? model,
      };
    }

    const image = await fetchImageFromUrl(imagePayload.value);
    return {
      bytes: image.bytes,
      mimeType: image.mimeType,
      model: payload.model ?? model,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("LaoZhang image generation timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
