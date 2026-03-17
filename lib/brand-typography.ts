export type OverlayTheme = "megaska-light" | "megaska-dark";

export type TypographyThemePreset = {
  panelFill: string;
  panelStroke: string;
  headlineColor: string;
  subtextColor: string;
  ctaTextColor: string;
  ctaFill: string;
};

export const BRAND_TYPOGRAPHY_PRESETS: Record<OverlayTheme, TypographyThemePreset> = {
  "megaska-light": {
    panelFill: "rgba(10, 12, 24, 0.58)",
    panelStroke: "rgba(255, 255, 255, 0.2)",
    headlineColor: "#ffffff",
    subtextColor: "rgba(245, 247, 255, 0.95)",
    ctaTextColor: "#ffffff",
    ctaFill: "rgba(20, 24, 36, 0.94)",
  },
  "megaska-dark": {
    panelFill: "rgba(255, 255, 255, 0.72)",
    panelStroke: "rgba(20, 24, 36, 0.18)",
    headlineColor: "#111827",
    subtextColor: "rgba(17, 24, 39, 0.9)",
    ctaTextColor: "#111827",
    ctaFill: "rgba(255, 255, 255, 0.98)",
  },
};
