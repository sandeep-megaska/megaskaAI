import sharp from "sharp";
import { BRAND_TYPOGRAPHY_PRESETS, type OverlayTheme } from "@/lib/brand-typography";

export type OverlayPosition = "top" | "center" | "bottom";

export type OverlayConfig = {
  headline?: string;
  subtext?: string;
  cta?: string;
  position?: OverlayPosition;
  theme?: OverlayTheme;
};

type NormalizedOverlay = {
  headline: string;
  subtext: string;
  cta: string;
  position: OverlayPosition;
  theme: OverlayTheme;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function wrapText(text: string, maxWidth: number, fontSize: number, maxLines: number) {
  if (!text) return [] as string[];

  const estimateCharWidth = Math.max(1, fontSize * 0.56);
  const maxCharsPerLine = Math.max(10, Math.floor(maxWidth / estimateCharWidth));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = "";
      if (lines.length >= maxLines) break;
    }

    if (word.length > maxCharsPerLine) {
      let remainder = word;
      while (remainder.length > maxCharsPerLine && lines.length < maxLines) {
        const slice = remainder.slice(0, maxCharsPerLine - 1);
        lines.push(`${slice}…`);
        remainder = remainder.slice(maxCharsPerLine - 1);
      }
      current = remainder;
    } else {
      current = word;
    }

    if (lines.length >= maxLines) break;
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").replaceAll("…", "").length) {
    const tail = lines[maxLines - 1];
    if (!tail.endsWith("…")) {
      lines[maxLines - 1] = `${tail.slice(0, Math.max(1, tail.length - 1))}…`;
    }
  }

  return lines;
}

function normalizeOverlay(overlay: OverlayConfig): NormalizedOverlay {
  return {
    headline: overlay.headline?.trim() ?? "",
    subtext: overlay.subtext?.trim() ?? "",
    cta: overlay.cta?.trim() ?? "",
    position: overlay.position ?? "bottom",
    theme: overlay.theme ?? "megaska-light",
  };
}

function mimeTypeForFormat(format?: string) {
  if (format === "jpeg" || format === "jpg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  if (format === "png") return "image/png";
  if (format === "gif") return "image/gif";
  return "image/png";
}

function outputConfigForFormat(format?: string) {
  if (format === "jpeg" || format === "jpg") {
    return { contentType: "image/jpeg", transform: (image: sharp.Sharp) => image.jpeg({ quality: 90 }) };
  }
  if (format === "webp") {
    return { contentType: "image/webp", transform: (image: sharp.Sharp) => image.webp({ quality: 92 }) };
  }
  return { contentType: "image/png", transform: (image: sharp.Sharp) => image.png({ compressionLevel: 9 }) };
}

export async function applyOverlayToImage(inputBuffer: Buffer, overlay: OverlayConfig): Promise<{ buffer: Buffer; contentType: string }> {
  const normalized = normalizeOverlay(overlay);
  const hasOverlayContent = Boolean(normalized.headline || normalized.subtext || normalized.cta);

  if (!hasOverlayContent) {
    const sourceFormat = await sharp(inputBuffer, { failOn: "none" }).metadata();
    return { buffer: inputBuffer, contentType: mimeTypeForFormat(sourceFormat.format) };
  }

  try {
    const image = sharp(inputBuffer, { failOn: "none" });
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      return { buffer: inputBuffer, contentType: mimeTypeForFormat(metadata.format) };
    }

    const width = metadata.width;
    const height = metadata.height;
    const theme = BRAND_TYPOGRAPHY_PRESETS[normalized.theme];

    const outerPadding = Math.max(24, Math.round(Math.min(width, height) * 0.05));
    const panelPaddingX = Math.max(20, Math.round(width * 0.03));
    const panelPaddingY = Math.max(20, Math.round(height * 0.03));
    const contentWidth = Math.max(200, width - outerPadding * 2 - panelPaddingX * 2);

    const headlineSize = Math.max(26, Math.round(Math.min(width, height) * 0.07));
    const subtextSize = Math.max(18, Math.round(headlineSize * 0.48));
    const ctaSize = Math.max(16, Math.round(subtextSize * 0.9));

    const headlineLines = wrapText(normalized.headline, contentWidth, headlineSize, 3);
    const subtextLines = wrapText(normalized.subtext, contentWidth, subtextSize, 3);
    const ctaLine = wrapText(normalized.cta, contentWidth * 0.45, ctaSize, 1)[0] ?? "";

    const headlineLineHeight = Math.round(headlineSize * 1.18);
    const subtextLineHeight = Math.round(subtextSize * 1.35);
    const ctaLineHeight = Math.round(ctaSize * 1.25);

    let contentHeight = 0;
    if (headlineLines.length) contentHeight += headlineLines.length * headlineLineHeight;
    if (headlineLines.length && subtextLines.length) contentHeight += Math.round(headlineSize * 0.35);
    if (subtextLines.length) contentHeight += subtextLines.length * subtextLineHeight;
    if ((headlineLines.length || subtextLines.length) && ctaLine) contentHeight += Math.round(subtextSize * 0.7);

    const ctaHorizontalPadding = Math.round(ctaSize * 0.75);
    const ctaVerticalPadding = Math.round(ctaSize * 0.5);
    const ctaWidth = ctaLine ? Math.min(contentWidth, Math.round(ctaLine.length * ctaSize * 0.6 + ctaHorizontalPadding * 2)) : 0;
    const ctaHeight = ctaLine ? ctaLineHeight + ctaVerticalPadding * 2 : 0;

    if (ctaLine) contentHeight += ctaHeight;

    const panelHeight = Math.min(height - outerPadding * 2, contentHeight + panelPaddingY * 2);

    const panelY =
      normalized.position === "top"
        ? outerPadding
        : normalized.position === "center"
          ? Math.round((height - panelHeight) / 2)
          : height - outerPadding - panelHeight;

    const panelX = outerPadding;
    const panelWidth = width - outerPadding * 2;
    const panelRadius = Math.round(Math.min(panelWidth, panelHeight) * 0.04);

    let cursorY = panelY + panelPaddingY + headlineSize;
    const textX = panelX + panelPaddingX;

    const headlineSvg = headlineLines
      .map((line) => {
        const lineSvg = `<text x="${textX}" y="${cursorY}" font-size="${headlineSize}" font-weight="700" fill="${theme.headlineColor}" font-family="Inter, Arial, sans-serif">${escapeXml(line)}</text>`;
        cursorY += headlineLineHeight;
        return lineSvg;
      })
      .join("");

    if (headlineLines.length && subtextLines.length) {
      cursorY += Math.round(headlineSize * 0.35);
    }

    const subtextSvg = subtextLines
      .map((line) => {
        const lineSvg = `<text x="${textX}" y="${cursorY}" font-size="${subtextSize}" font-weight="500" fill="${theme.subtextColor}" font-family="Inter, Arial, sans-serif">${escapeXml(line)}</text>`;
        cursorY += subtextLineHeight;
        return lineSvg;
      })
      .join("");

    if ((headlineLines.length || subtextLines.length) && ctaLine) {
      cursorY += Math.round(subtextSize * 0.7);
    }

    const ctaSvg = ctaLine
      ? `<rect x="${textX}" y="${cursorY - ctaSize - ctaVerticalPadding + 4}" width="${ctaWidth}" height="${ctaHeight}" rx="${Math.round(ctaHeight / 2)}" fill="${theme.ctaFill}" />
         <text x="${textX + ctaHorizontalPadding}" y="${cursorY + ctaVerticalPadding}" font-size="${ctaSize}" font-weight="700" fill="${theme.ctaTextColor}" font-family="Inter, Arial, sans-serif">${escapeXml(ctaLine)}</text>`
      : "";

    const overlaySvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect x="${panelX}" y="${panelY}" width="${panelWidth}" height="${panelHeight}" rx="${panelRadius}" fill="${theme.panelFill}" stroke="${theme.panelStroke}" stroke-width="1" />
        ${headlineSvg}
        ${subtextSvg}
        ${ctaSvg}
      </svg>
    `;

    const outputConfig = outputConfigForFormat(metadata.format);
    const buffer = await outputConfig
      .transform(image.composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }]))
      .toBuffer();

    return { buffer, contentType: outputConfig.contentType };
  } catch (error) {
    console.error("[overlay] failed to apply overlay", error);
    const sourceFormat = await sharp(inputBuffer, { failOn: "none" }).metadata();
    return { buffer: inputBuffer, contentType: mimeTypeForFormat(sourceFormat.format) };
  }
}

export async function applyDeterministicOverlay(imageBuffer: Buffer, overlay: OverlayConfig): Promise<Buffer> {
  const result = await applyOverlayToImage(imageBuffer, overlay);
  return result.buffer;
}
