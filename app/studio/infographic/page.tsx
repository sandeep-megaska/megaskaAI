"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ImagePlus, LayoutTemplate, RefreshCw, Sparkles, X } from "lucide-react";
import PageShell from "@/components/ui/PageShell";
import Button from "@/components/ui/Button";
import { Card, SectionHeading, Well } from "@/components/ui/Surface";
import {
  INFOGRAPHIC_CANVAS_SIZE,
  INFOGRAPHIC_TEMPLATES,
  normalizeFeatureLabel,
  splitFeatureLabel,
  type InfographicTemplate,
} from "@/lib/infographic/layout";

type LocalImage = { file: File; url: string };
type FeatureState = { label: string; image: LocalImage | null };

const DEFAULT_FEATURES = [
  "Easy full-zip closure",
  "Flowy coverage",
  "Secure inner fit",
];

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load an image used by the infographic."));
    image.src = src;
  });
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  padding = 0,
) {
  const targetW = Math.max(1, width - padding * 2);
  const targetH = Math.max(1, height - padding * 2);
  const scale = Math.max(targetW / image.naturalWidth, targetH / image.naturalHeight);
  const sourceW = targetW / scale;
  const sourceH = targetH / scale;
  const sourceX = (image.naturalWidth - sourceW) / 2;
  const sourceY = (image.naturalHeight - sourceH) / 2;
  ctx.drawImage(image, sourceX, sourceY, sourceW, sourceH, x + padding, y + padding, targetW, targetH);
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  centerY: number,
  align: CanvasTextAlign = "right",
  maxChars = 19,
) {
  const lines = splitFeatureLabel(text, maxChars);
  ctx.save();
  ctx.fillStyle = "#111111";
  ctx.font = "700 52px Arial, Helvetica, sans-serif";
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  const lineHeight = 58;
  const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => ctx.fillText(line, x, startY + index * lineHeight));
  ctx.restore();
}

function drawCalloutLine(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  y: number,
  toX: number,
  dotX: number,
) {
  ctx.save();
  ctx.strokeStyle = "#d8df00";
  ctx.fillStyle = "#e5ec00";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(fromX, y);
  ctx.lineTo(toX, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(dotX, y, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

async function drawBrandMark(ctx: CanvasRenderingContext2D) {
  try {
    const logo = await loadImage("/logo_megaska.png");
    ctx.save();
    ctx.fillStyle = "#f3f516";
    ctx.beginPath();
    ctx.roundRect(76, 70, 150, 150, 22);
    ctx.fill();
    drawContain(ctx, logo, 90, 84, 122, 122);
    ctx.restore();
  } catch {
    ctx.save();
    ctx.fillStyle = "#111";
    ctx.font = "800 40px Arial, Helvetica, sans-serif";
    ctx.fillText("MEGASKA", 76, 120);
    ctx.restore();
  }
}

async function renderHeroDetails(
  ctx: CanvasRenderingContext2D,
  hero: HTMLImageElement,
  details: HTMLImageElement[],
  labels: string[],
  variant: string,
) {
  drawContain(ctx, hero, 40, 120, 1190, 1780);
  const cardX = 1420;
  const cardW = 500;
  const cardH = 455;
  const starts = [70, 620, 1170];

  starts.forEach((y, index) => {
    ctx.fillStyle = "#f4f4f4";
    ctx.fillRect(cardX, y, cardW, cardH);
    drawCover(ctx, details[index] ?? hero, cardX, y, cardW, cardH);
    const centerY = y + cardH / 2;
    drawLabel(ctx, labels[index], cardX - 65, centerY, "right");
    drawCalloutLine(ctx, cardX - 45, centerY, cardX + 145, cardX + 145);
  });

  ctx.fillStyle = "#111";
  ctx.font = "800 58px Arial, Helvetica, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(variant || "MEGASKA", cardX + cardW / 2, 1905);
}

async function renderCenterCallouts(
  ctx: CanvasRenderingContext2D,
  hero: HTMLImageElement,
  details: HTMLImageElement[],
  labels: string[],
  variant: string,
) {
  drawContain(ctx, hero, 410, 170, 1180, 1660);
  const positions = [
    { x: 320, y: 520, align: "right" as const, lineFrom: 340, lineTo: 650, dot: 650 },
    { x: 1680, y: 940, align: "left" as const, lineFrom: 1350, lineTo: 1660, dot: 1350 },
    { x: 320, y: 1370, align: "right" as const, lineFrom: 340, lineTo: 650, dot: 650 },
  ];
  positions.forEach((position, index) => {
    drawLabel(ctx, labels[index], position.x, position.y, position.align, 17);
    drawCalloutLine(ctx, position.lineFrom, position.y, position.lineTo, position.dot);
  });
  ctx.fillStyle = "#111";
  ctx.font = "800 54px Arial, Helvetica, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(variant || "MEGASKA", 1900, 1910);
  void details;
}

async function renderFeatureGrid(
  ctx: CanvasRenderingContext2D,
  hero: HTMLImageElement,
  details: HTMLImageElement[],
  labels: string[],
  variant: string,
) {
  drawContain(ctx, hero, 190, 70, 1620, 1120);
  const gap = 32;
  const cardW = 600;
  const cardH = 500;
  const startX = 68;
  for (let index = 0; index < 3; index += 1) {
    const x = startX + index * (cardW + gap);
    const y = 1280;
    ctx.fillStyle = "#f3f3f3";
    ctx.fillRect(x, y, cardW, cardH);
    drawCover(ctx, details[index] ?? hero, x, y, cardW, 370);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, y + 370, cardW, 130);
    drawLabel(ctx, labels[index], x + cardW / 2, y + 435, "center", 18);
  }
  ctx.fillStyle = "#111";
  ctx.font = "800 48px Arial, Helvetica, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(variant || "MEGASKA", 1930, 1905);
}

export default function InfographicStudioPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hero, setHero] = useState<LocalImage | null>(null);
  const [features, setFeatures] = useState<FeatureState[]>(
    DEFAULT_FEATURES.map((label) => ({ label, image: null })),
  );
  const [template, setTemplate] = useState<InfographicTemplate>("hero-details");
  const [variant, setVariant] = useState("");
  const [status, setStatus] = useState("Upload a product image to begin.");
  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    return () => {
      if (hero) URL.revokeObjectURL(hero.url);
      features.forEach((feature) => {
        if (feature.image) URL.revokeObjectURL(feature.image.url);
      });
    };
  }, [hero, features]);

  const setLocalImage = useCallback((file: File | undefined, target: "hero" | number) => {
    if (!file || !file.type.startsWith("image/")) return;
    const next = { file, url: URL.createObjectURL(file) };
    if (target === "hero") {
      setHero((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return next;
      });
      return;
    }
    setFeatures((current) =>
      current.map((feature, index) => {
        if (index !== target) return feature;
        if (feature.image) URL.revokeObjectURL(feature.image.url);
        return { ...feature, image: next };
      }),
    );
  }, []);

  const render = useCallback(async () => {
    if (!hero || !canvasRef.current) {
      setStatus("Upload a hero product image first.");
      return;
    }

    setIsRendering(true);
    setStatus("Rendering marketplace image…");
    try {
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) throw new Error("Canvas is unavailable in this browser.");
      canvasRef.current.width = INFOGRAPHIC_CANVAS_SIZE;
      canvasRef.current.height = INFOGRAPHIC_CANVAS_SIZE;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, INFOGRAPHIC_CANVAS_SIZE, INFOGRAPHIC_CANVAS_SIZE);

      const heroImage = await loadImage(hero.url);
      const detailImages = await Promise.all(
        features.map((feature) => loadImage(feature.image?.url ?? hero.url)),
      );
      const labels = features.map((feature, index) =>
        normalizeFeatureLabel(feature.label, DEFAULT_FEATURES[index]),
      );

      if (template === "hero-details") {
        await renderHeroDetails(ctx, heroImage, detailImages, labels, variant.trim().toUpperCase());
      } else if (template === "center-callouts") {
        await renderCenterCallouts(ctx, heroImage, detailImages, labels, variant.trim().toUpperCase());
      } else {
        await renderFeatureGrid(ctx, heroImage, detailImages, labels, variant.trim().toUpperCase());
      }
      await drawBrandMark(ctx);
      setStatus("Ready to export. Review every feature claim before marketplace use.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not render the infographic.");
    } finally {
      setIsRendering(false);
    }
  }, [features, hero, template, variant]);

  useEffect(() => {
    if (hero) void render();
  }, [hero, template]); // eslint-disable-line react-hooks/exhaustive-deps

  function download() {
    const canvas = canvasRef.current;
    if (!canvas || !hero) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `megaska-infographic-${Date.now()}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  const rail = (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionHeading title="1. Product image" description="Use a real approved product/model image. The garment is never regenerated." />
        <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-well px-4 py-5 text-sm text-ink-2 hover:text-ink">
          <ImagePlus className="h-4 w-4" />
          {hero ? "Replace hero image" : "Upload hero image"}
          <input
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setLocalImage(event.target.files?.[0], "hero")}
          />
        </label>
        {hero ? <p className="mt-2 truncate text-xs text-ink-3">{hero.file.name}</p> : null}
      </Card>

      <Card className="p-4">
        <SectionHeading title="2. Template" description="Choose a repeatable marketplace composition." />
        <div className="mt-3 space-y-2">
          {INFOGRAPHIC_TEMPLATES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTemplate(item.id)}
              className={`w-full rounded-xl border p-3 text-left transition-colors ${
                template === item.id ? "border-accent bg-accent/10" : "border-line bg-well hover:border-line-strong"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <LayoutTemplate className="h-4 w-4" />
                {item.label}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-ink-3">{item.description}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeading title="3. Feature callouts" description="Keep claims short, factual and product-specific." />
        <div className="mt-3 space-y-4">
          {features.map((feature, index) => (
            <Well key={index} className="p-3">
              <label className="text-xs font-medium text-ink-2" htmlFor={`feature-${index}`}>
                Feature {index + 1}
              </label>
              <input
                id={`feature-${index}`}
                value={feature.label}
                maxLength={48}
                onChange={(event) =>
                  setFeatures((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, label: event.target.value } : item,
                    ),
                  )
                }
                className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
              <div className="mt-2 flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-2 hover:text-ink">
                  <ImagePlus className="h-3.5 w-3.5" />
                  {feature.image ? "Replace detail" : "Add detail image"}
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => setLocalImage(event.target.files?.[0], index)}
                  />
                </label>
                {feature.image ? (
                  <button
                    type="button"
                    aria-label={`Remove detail image ${index + 1}`}
                    onClick={() =>
                      setFeatures((current) =>
                        current.map((item, itemIndex) => {
                          if (itemIndex !== index) return item;
                          if (item.image) URL.revokeObjectURL(item.image.url);
                          return { ...item, image: null };
                        }),
                      )
                    }
                    className="rounded-lg border border-line p-1.5 text-ink-3 hover:text-ink"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </Well>
          ))}
        </div>
        <label className="mt-4 block text-xs font-medium text-ink-2" htmlFor="variant">
          Variant / color label
        </label>
        <input
          id="variant"
          value={variant}
          maxLength={28}
          placeholder="e.g. BERRY"
          onChange={(event) => setVariant(event.target.value)}
          className="mt-1.5 w-full rounded-lg border border-line bg-well px-3 py-2 text-sm text-ink"
        />
      </Card>

      <div className="flex gap-2">
        <Button onClick={() => void render()} disabled={!hero || isRendering} className="flex-1">
          {isRendering ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Render
        </Button>
        <Button onClick={download} disabled={!hero || isRendering} variant="secondary">
          <Download className="h-4 w-4" />
          PNG
        </Button>
      </div>
    </div>
  );

  return (
    <PageShell
      accent="violet"
      eyebrow="Marketplace creative"
      title="Infographic Studio"
      description="Build consistent 2000 × 2000 product feature images from approved photography. Layout and typography are deterministic; the garment pixels are not AI-regenerated."
      rail={rail}
    >
      <Card className="overflow-hidden p-4">
        <SectionHeading title="Preview" description={status} />
        <div className="mt-4 flex min-h-[520px] items-center justify-center rounded-xl border border-line bg-well p-3">
          {hero ? (
            <canvas
              ref={canvasRef}
              className="h-auto max-h-[72vh] w-full max-w-[820px] rounded-lg bg-white object-contain shadow-raised"
              aria-label="Infographic preview"
            />
          ) : (
            <div className="max-w-sm text-center">
              <ImagePlus className="mx-auto h-8 w-8 text-ink-3" />
              <p className="mt-3 text-sm font-medium text-ink">Upload a product image</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-3">
                The first template mirrors the proven hero-plus-detail structure in your reference while keeping MEGASKA branding and copy editable.
              </p>
            </div>
          )}
        </div>
      </Card>

      <Well className="p-4">
        <p className="text-sm font-medium text-ink">Marketplace-safe workflow</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-3">
          Use approved product photography and verify every callout against the actual SKU. This first slice deliberately avoids generative edits to garment construction, color, fit or closures.
        </p>
      </Well>
    </PageShell>
  );
}
