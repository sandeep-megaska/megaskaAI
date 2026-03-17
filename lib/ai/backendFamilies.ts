export function isGeminiImageModel(model: string) {
  const normalized = model.trim().toLowerCase();
  return normalized.startsWith("gemini-") && normalized.includes("image");
}

export function isImagenModel(model: string) {
  return model.trim().toLowerCase().startsWith("imagen-");
}

export function isVeoModel(model: string) {
  return model.trim().toLowerCase().startsWith("veo-");
}
