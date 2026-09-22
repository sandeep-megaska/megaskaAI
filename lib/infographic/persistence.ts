import type { EditorDocument } from "./editor";
import type { CreativeTemplate } from "./templates";

export type SavedCreative = {
  id: string;
  name: string;
  updatedAt: string;
  document: EditorDocument;
};

export type SavedAsset = {
  id: string;
  name: string;
  src: string;
  createdAt: string;
};

export const STORAGE_KEYS = {
  projects: "megaska.infographic.projects.v1",
  templates: "megaska.infographic.templates.v1",
  assets: "megaska.infographic.assets.v1",
} as const;

export function cloneDocument(document: EditorDocument): EditorDocument {
  return JSON.parse(JSON.stringify(document)) as EditorDocument;
}

export function saveCreative(items: SavedCreative[], name: string, document: EditorDocument, id?: string): SavedCreative[] {
  const now = new Date().toISOString();
  const item: SavedCreative = { id: id ?? `project-${Date.now()}`, name: name.trim() || "Untitled creative", updatedAt: now, document: cloneDocument(document) };
  return [item, ...items.filter((entry) => entry.id !== item.id)];
}

export function saveTemplate(items: CreativeTemplate[], name: string, document: EditorDocument): CreativeTemplate[] {
  const item: CreativeTemplate = { id: `custom-${Date.now()}`, name: name.trim() || "Custom template", description: "Saved from Product Creative Studio.", document: cloneDocument(document) };
  return [item, ...items];
}

export function upsertAsset(items: SavedAsset[], asset: SavedAsset): SavedAsset[] {
  return [asset, ...items.filter((entry) => entry.id !== asset.id)];
}

export function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}
