export type EditorElementKind = "text" | "shape" | "image";

export type EditorBaseElement = {
  id: string;
  name: string;
  kind: EditorElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
};

export type EditorTextElement = EditorBaseElement & {
  kind: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: "left" | "center" | "right";
};

export type EditorShapeElement = EditorBaseElement & {
  kind: "shape";
  shape: "rectangle" | "rounded" | "circle" | "line";
  fill: string;
  stroke: string;
  strokeWidth: number;
};

export type EditorImageElement = EditorBaseElement & {
  kind: "image";
  src: string;
  fit: "contain" | "cover";
};

export type EditorElement = EditorTextElement | EditorShapeElement | EditorImageElement;

export type EditorDocument = {
  width: number;
  height: number;
  background: string;
  elements: EditorElement[];
};

export function createId(prefix = "element") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function moveElement(element: EditorElement, dx: number, dy: number): EditorElement {
  if (element.locked) return element;
  return { ...element, x: element.x + dx, y: element.y + dy };
}

export function resizeElement(element: EditorElement, width: number, height: number): EditorElement {
  if (element.locked) return element;
  return { ...element, width: Math.max(20, width), height: Math.max(20, height) };
}

export function rotateElement(element: EditorElement, rotation: number): EditorElement {
  if (element.locked) return element;
  const normalized = ((rotation % 360) + 360) % 360;
  return { ...element, rotation: normalized };
}

export function duplicateElement(element: EditorElement): EditorElement {
  return { ...element, id: createId(element.kind), name: `${element.name} copy`, x: element.x + 30, y: element.y + 30, locked: false };
}

export function reorderElement(elements: EditorElement[], id: string, direction: "forward" | "backward") {
  const index = elements.findIndex((element) => element.id === id);
  if (index < 0) return elements;
  const target = direction === "forward" ? Math.min(elements.length - 1, index + 1) : Math.max(0, index - 1);
  if (target === index) return elements;
  const next = [...elements];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function clampZoom(value: number) {
  return Math.max(0.2, Math.min(2, value));
}

export function snapValue(value: number, grid = 10, enabled = true) {
  return enabled ? Math.round(value / grid) * grid : value;
}
