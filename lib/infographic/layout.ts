export type InfographicTemplate = "hero-details" | "center-callouts" | "feature-grid";
export type MarketplacePresetId = "amazon-square" | "myntra-portrait" | "shopify-square" | "shopify-portrait" | "custom";
export type ShapeKind = "rectangle" | "rounded" | "circle" | "line";

export type MarketplacePreset = {
  id: MarketplacePresetId;
  label: string;
  width: number;
  height: number;
  note: string;
};

export type InfographicStyle = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  textColor: string;
  accentColor: string;
  backgroundColor: string;
};

export type InfographicShape = {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
};

export const MARKETPLACE_PRESETS: MarketplacePreset[] = [
  { id: "amazon-square", label: "Amazon · Square", width: 2000, height: 2000, note: "Square working preset; verify the target category before upload." },
  { id: "myntra-portrait", label: "Myntra · Portrait", width: 1600, height: 2133, note: "Portrait working preset; verify current marketplace requirements before upload." },
  { id: "shopify-square", label: "Shopify · Square", width: 2000, height: 2000, note: "Square storefront creative." },
  { id: "shopify-portrait", label: "Shopify · 4:5", width: 1600, height: 2000, note: "Portrait storefront / campaign creative." },
  { id: "custom", label: "Custom", width: 2000, height: 2000, note: "Choose exact export dimensions." },
];

export const FONT_OPTIONS = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Trebuchet", value: "Trebuchet MS, Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Arial, sans-serif" },
];

export const DEFAULT_INFOGRAPHIC_STYLE: InfographicStyle = {
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: 52,
  fontWeight: 700,
  textColor: "#111111",
  accentColor: "#e5ec00",
  backgroundColor: "#ffffff",
};

export const INFOGRAPHIC_TEMPLATES: Array<{ id: InfographicTemplate; label: string; description: string }> = [
  { id: "hero-details", label: "Hero + details", description: "Large product image with three stacked detail crops and callout labels." },
  { id: "center-callouts", label: "Center + callouts", description: "Centered product image with concise feature labels on both sides." },
  { id: "feature-grid", label: "Feature grid", description: "Product hero above a three-card detail grid for construction and fit features." },
];

export function normalizeFeatureLabel(value: string, fallback: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, 64);
}

export function splitFeatureLabel(value: string, maxChars = 20) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) current = next;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

export function clampCanvasDimension(value: number) {
  if (!Number.isFinite(value)) return 2000;
  return Math.max(500, Math.min(5000, Math.round(value)));
}

export function scaleFromDesign(value: number, canvasWidth: number) {
  return value * (canvasWidth / 2000);
}
