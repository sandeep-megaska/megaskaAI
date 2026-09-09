import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const BYTES_IN_MB = 1024 * 1024;
const DEFAULT_VIDEO_MAX_UPLOAD_BYTES = 45 * BYTES_IN_MB;
const DEFAULT_VIDEO_RESUMABLE_THRESHOLD_BYTES = 8 * BYTES_IN_MB;

export class UploadSizeLimitError extends Error {
  readonly code = "upload-limit-exceeded";
  readonly sizeBytes: number;
  readonly maxBytes: number;
  readonly sizeMb: number;
  readonly maxMb: number;
  /** Which limit rejected the object: this app's own guard, or Supabase Storage. */
  readonly limitSource: "app" | "storage";
  /** False when Supabase rejected the object but its ceiling could not be read. */
  readonly limitKnown: boolean;

  constructor(input: {
    sizeBytes: number;
    maxBytes: number;
    limitSource?: "app" | "storage";
    limitKnown?: boolean;
  }) {
    const sizeMb = bytesToMb(input.sizeBytes);
    const maxMb = bytesToMb(input.maxBytes);
    const limitSource = input.limitSource ?? "app";
    const limitKnown = input.limitKnown ?? true;
    const size = `${input.sizeBytes} bytes / ${sizeMb.toFixed(2)} MB`;
    const max = `${input.maxBytes} bytes / ${maxMb.toFixed(2)} MB`;

    let detail: string;
    if (limitSource === "app") {
      detail = `Max allowed is ${max}.`;
    } else if (limitKnown) {
      detail = `Supabase Storage allows ${max} per object in this bucket. Raise the bucket's file size limit, and the project's global upload limit, in Supabase Storage settings.`;
    } else {
      detail =
        "Supabase Storage rejected it as too large. Raise the bucket's file size limit, and the project's global upload limit, in Supabase Storage settings.";
    }

    super(`Video file is too large to upload (${size}). ${detail}`);
    this.name = "UploadSizeLimitError";
    this.sizeBytes = input.sizeBytes;
    this.maxBytes = input.maxBytes;
    this.sizeMb = sizeMb;
    this.maxMb = maxMb;
    this.limitSource = limitSource;
    this.limitKnown = limitKnown;
  }
}

/**
 * Supabase Storage answers an oversized object with HTTP 413 EntityTooLarge and
 * the message "The object exceeded the maximum allowed size". The JS client
 * surfaces that as a plain error, so match on both shapes.
 */
function isStorageSizeLimitError(error: { message?: string; statusCode?: string; status?: number } | null) {
  if (!error) return false;
  const status = Number(error.statusCode ?? error.status ?? 0);
  if (status === 413) return true;
  return /exceeded the maximum allowed size|entity ?too ?large|payload too large/i.test(error.message ?? "");
}

/**
 * The bucket's own per-object limit, so a rejection can name the real ceiling
 * rather than this app's guess. Returns null when it cannot be read (missing
 * permission, or a null limit meaning "inherit the project global limit").
 */
async function readBucketSizeLimit(bucket: string): Promise<number | null> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.storage.getBucket(bucket);
    if (error || !data) return null;
    const limit = (data as { file_size_limit?: number | null }).file_size_limit;
    return typeof limit === "number" && limit > 0 ? limit : null;
  } catch {
    return null;
  }
}

async function storageSizeLimitError(bucket: string, sizeBytes: number) {
  const bucketLimit = await readBucketSizeLimit(bucket);
  return new UploadSizeLimitError({
    sizeBytes,
    maxBytes: bucketLimit ?? getVideoUploadThresholds().maxBytes,
    limitSource: "storage",
    limitKnown: bucketLimit !== null,
  });
}

function bytesToMb(bytes: number) {
  return bytes / BYTES_IN_MB;
}

function readByteLimit(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function getVideoUploadThresholds() {
  return {
    maxBytes: readByteLimit(process.env.SUPABASE_VIDEO_MAX_UPLOAD_BYTES, DEFAULT_VIDEO_MAX_UPLOAD_BYTES),
    resumableThresholdBytes: readByteLimit(
      process.env.SUPABASE_VIDEO_RESUMABLE_THRESHOLD_BYTES,
      DEFAULT_VIDEO_RESUMABLE_THRESHOLD_BYTES,
    ),
  };
}

function logUpload(input: {
  mode: "standard" | "resumable";
  fileName: string;
  contentType: string;
  sizeBytes: number;
  bucket: string;
  filePath: string;
}) {
  console.log("[supabase-upload] upload start", {
    mode: input.mode,
    fileName: input.fileName,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    sizeMb: Number(bytesToMb(input.sizeBytes).toFixed(2)),
    bucket: input.bucket,
    filePath: input.filePath,
  });
}

export async function uploadGeneratedVideoToSupabase(input: {
  bucket: string;
  bytes: Buffer;
  fileName: string;
  filePath: string;
  mimeType: string;
}) {
  const thresholds = getVideoUploadThresholds();
  const contentType = input.mimeType || "video/mp4";
  const sizeBytes = input.bytes.length;

  if (sizeBytes > thresholds.maxBytes) {
    throw new UploadSizeLimitError({ sizeBytes, maxBytes: thresholds.maxBytes });
  }

  const shouldUseResumable = sizeBytes >= thresholds.resumableThresholdBytes;

  if (shouldUseResumable) {
    logUpload({
      mode: "resumable",
      fileName: input.fileName,
      contentType,
      sizeBytes,
      bucket: input.bucket,
      filePath: input.filePath,
    });
    await uploadViaTusResumable({
      bucket: input.bucket,
      filePath: input.filePath,
      contentType,
      bytes: input.bytes,
    });
  } else {
    logUpload({
      mode: "standard",
      fileName: input.fileName,
      contentType,
      sizeBytes,
      bucket: input.bucket,
      filePath: input.filePath,
    });
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.storage.from(input.bucket).upload(input.filePath, input.bytes, {
      contentType,
      upsert: false,
    });
    if (error) {
      if (isStorageSizeLimitError(error)) {
        throw await storageSizeLimitError(input.bucket, sizeBytes);
      }
      throw new Error(`Supabase upload failed: ${error.message}`);
    }
  }

  const supabase = getSupabaseAdminClient();
  const { data } = supabase.storage.from(input.bucket).getPublicUrl(input.filePath);
  return { publicUrl: data.publicUrl, thresholds, usedResumable: shouldUseResumable };
}

async function uploadViaTusResumable(input: { bucket: string; filePath: string; contentType: string; bytes: Buffer }) {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/upload/resumable`;
  const metadataHeader = [
    `bucketName ${Buffer.from(input.bucket).toString("base64")}`,
    `objectName ${Buffer.from(input.filePath).toString("base64")}`,
    `contentType ${Buffer.from(input.contentType).toString("base64")}`,
  ].join(",");

  const createResponse = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${supabaseServiceKey}`,
      "x-upsert": "false",
      "tus-resumable": "1.0.0",
      "upload-length": String(input.bytes.length),
      "upload-metadata": metadataHeader,
    },
  });

  if (!createResponse.ok) {
    const body = await createResponse.text();
    if (isStorageSizeLimitError({ message: body, status: createResponse.status })) {
      throw await storageSizeLimitError(input.bucket, input.bytes.length);
    }
    throw new Error(`Supabase resumable upload init failed (${createResponse.status}): ${body.slice(0, 240)}`);
  }

  const location = createResponse.headers.get("location");
  if (!location) throw new Error("Supabase resumable upload init failed: missing upload URL.");
  const uploadUrl = location.startsWith("http") ? location : `${supabaseUrl.replace(/\/$/, "")}${location}`;

  const patchResponse = await fetch(uploadUrl, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${supabaseServiceKey}`,
      "x-upsert": "false",
      "tus-resumable": "1.0.0",
      "upload-offset": "0",
      "content-type": "application/offset+octet-stream",
    },
    body: new Uint8Array(input.bytes),
  });

  if (!patchResponse.ok) {
    const body = await patchResponse.text();
    if (isStorageSizeLimitError({ message: body, status: patchResponse.status })) {
      throw await storageSizeLimitError(input.bucket, input.bytes.length);
    }
    throw new Error(`Supabase resumable upload patch failed (${patchResponse.status}): ${body.slice(0, 240)}`);
  }
}
