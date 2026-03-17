export type AIBackendType = "image" | "video";

export type AIBackend = {
  id: string;
  name: string;
  type: AIBackendType;
  model: string;
};

export const AI_BACKENDS: AIBackend[] = [
  {
    id: "nano-banana-pro",
    name: "Nano Banana Pro",
    type: "image",
    model: "gemini-3-pro-image-preview",
  },
  {
    id: "nano-banana",
    name: "Nano Banana",
    type: "image",
    model: "gemini-2.5-flash-image",
  },
  {
    id: "imagen",
    name: "Imagen (High Quality)",
    type: "image",
    model: "imagen-4.0-generate-001",
  },
  {
    id: "veo",
    name: "Veo (Video)",
    type: "video",
    model: "veo-2.0-generate-001",
  },
];

export function findBackendById(id?: string | null) {
  if (!id) return null;
  return AI_BACKENDS.find((backend) => backend.id === id) ?? null;
}

export function getDefaultBackendForType(type: AIBackendType) {
  if (type === "video") {
    return findBackendById("veo")!;
  }

  return findBackendById("imagen")!;
}
