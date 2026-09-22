export const INFOGRAPHIC_CANVAS_SIZE = 2000;

export type InfographicTemplate = "hero-details" | "center-callouts" | "feature-grid";

export type InfographicFeature = {
  label: string;
  detailUrl?: string;
};

export const INFOGRAPHIC_TEMPLATES: Array<{
  id: InfographicTemplate;
  label: string;
  description: string;
}> = [
  {
    id: "hero-details",
    label: "Hero + details",
    description: "Large product image with three stacked detail crops and callout labels.",
  },
  {
    id: "center-callouts",
    label: "Center + callouts",
    description: "Centered product image with concise feature labels on both sides.",
  },
  {
    id: "feature-grid",
    label: "Feature grid",
    description: "Product hero above a three-card detail grid for construction and fit features.",
  },
];

export function normalizeFeatureLabel(value: string, fallback: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, 48).toUpperCase();
}

export function splitFeatureLabel(value: string, maxChars = 20) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}
