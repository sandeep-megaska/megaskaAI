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
    id: "nano-banana-2",
    name: "Nano Banana 2",
    type: "image",
    model: "gemini-3.1-flash-image-preview",
  },
  {
    id: "nano-banana",
    name: "Nano Banana",
    type: "image",
    model: "gemini-2.5-flash-image",
  },
  {
    id: "imagen-4",
    name: "Imagen 4",
    type: "image",
    model: "imagen-4.0-generate-001",
  },
  {
    id: "imagen-4-ultra",
    name: "Imagen 4 Ultra",
    type: "image",
    model: "imagen-4.0-ultra-generate-001",
  },
  {
    id: "imagen-4-fast",
    name: "Imagen 4 Fast",
    type: "image",
    model: "imagen-4.0-fast-generate-001",
  },
  {
    id: "veo-2",
    name: "Veo 2",
    type: "video",
    model: "veo-2.0-generate-001",
  },
  {
    id: "veo-3",
    name: "Veo 3",
    type: "video",
    model: "veo-3.0-generate-001",
  },
  {
    id: "veo-3-fast",
    name: "Veo 3 Fast",
    type: "video",
    model: "veo-3.0-fast-generate-001",
  },
  {
    id: "veo-3.1",
    name: "Veo 3.1",
    type: "video",
    model: "veo-3.1-generate-001",
  },
  {
    id: "veo-3.1-fast",
    name: "Veo 3.1 Fast",
    type: "video",
    model: "veo-3.1-fast-generate-001",
  },
];

export function findBackendById(id?: string | null) {
  if (!id) return null;
  return AI_BACKENDS.find((backend) => backend.id === id) ?? null;
}

export function getDefaultBackendForType(type: AIBackendType) {
  if (type === "video") {
    return findBackendById("veo-3") ?? findBackendById("veo-2")!;
  }

  return findBackendById("imagen-4")!;
}
