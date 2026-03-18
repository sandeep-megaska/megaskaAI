export const STUDIO_ASPECT_RATIOS = ["1:1", "4:5", "3:4", "2:3", "3:2", "16:9", "9:16"] as const;

export type StudioAspectRatio = (typeof STUDIO_ASPECT_RATIOS)[number];

export type StudioAspectRatioOption = {
  id: string;
  label: string;
  ratio: StudioAspectRatio;
  description?: string;
};

export const STUDIO_ASPECT_RATIO_OPTIONS: StudioAspectRatioOption[] = [
  { id: "instagram-portrait", label: "Instagram Portrait", ratio: "4:5" },
  { id: "instagram-post", label: "Instagram Post / Square", ratio: "1:1" },
  { id: "instagram-story", label: "Instagram Story / Reel", ratio: "9:16" },
  { id: "landscape-banner", label: "Landscape Banner", ratio: "16:9" },
  { id: "portrait-editorial", label: "Portrait Editorial", ratio: "3:4" },
  { id: "classic-portrait", label: "Classic Portrait", ratio: "2:3" },
  { id: "classic-landscape", label: "Classic Landscape", ratio: "3:2" },
];

export function isStudioAspectRatio(value: string): value is StudioAspectRatio {
  return STUDIO_ASPECT_RATIOS.includes(value as StudioAspectRatio);
}
