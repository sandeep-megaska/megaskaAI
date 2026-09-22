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
  groupId?: string;
};

export type EditorTextElement = EditorBaseElement & {
  kind: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: "left" | "center" | "right";
  italic: boolean;
  uppercase: boolean;
  lineHeight: number;
  letterSpacing: number;
  backgroundColor: string;
  shadowColor: string;
  shadowBlur: number;
  shadowX: number;
  shadowY: number;
};

export type EditorShapeElement = EditorBaseElement & {
  kind: "shape";
  shape: "rectangle" | "rounded" | "circle" | "line" | "arrow" | "triangle" | "badge";
  fill: string;
  stroke: string;
  strokeWidth: number;
};

export type EditorImageElement = EditorBaseElement & {
  kind: "image";
  src: string;
  fit: "contain" | "cover";
  cropX: number;
  cropY: number;
  cropZoom: number;
  borderRadius: number;
  flipX: boolean;
  flipY: boolean;
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


export type AlignmentGuide = { axis: "x" | "y"; value: number };

export function clampCropOffset(value: number) {
  return Math.max(-100, Math.min(100, value));
}

export function clampCropZoom(value: number) {
  return Math.max(1, Math.min(4, value));
}

export function alignmentGuides(element: EditorElement, doc: EditorDocument, threshold = 8): AlignmentGuide[] {
  const guides: AlignmentGuide[] = [];
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const candidatesX = [0, doc.width / 2, doc.width];
  const candidatesY = [0, doc.height / 2, doc.height];
  const edgesX = [element.x, centerX, element.x + element.width];
  const edgesY = [element.y, centerY, element.y + element.height];
  for (const candidate of candidatesX) if (edgesX.some((value) => Math.abs(value - candidate) <= threshold)) guides.push({ axis: "x", value: candidate });
  for (const candidate of candidatesY) if (edgesY.some((value) => Math.abs(value - candidate) <= threshold)) guides.push({ axis: "y", value: candidate });
  return guides;
}


export function selectedElements(elements: EditorElement[], ids: string[]) {
  const wanted = new Set(ids);
  return elements.filter((element) => wanted.has(element.id));
}

export function groupElements(elements: EditorElement[], ids: string[], groupId = createId("group")) {
  if (ids.length < 2) return elements;
  const wanted = new Set(ids);
  return elements.map((element) => wanted.has(element.id) ? { ...element, groupId } : element);
}

export function ungroupElements(elements: EditorElement[], ids: string[]) {
  const groups = new Set(elements.filter((element) => ids.includes(element.id)).map((element) => element.groupId).filter(Boolean));
  if (!groups.size) return elements;
  return elements.map((element) => element.groupId && groups.has(element.groupId) ? { ...element, groupId: undefined } : element);
}

export function expandSelectionToGroups(elements: EditorElement[], ids: string[]) {
  const selected = selectedElements(elements, ids);
  const groups = new Set(selected.map((element) => element.groupId).filter(Boolean));
  if (!groups.size) return ids;
  return Array.from(new Set([...ids, ...elements.filter((element) => element.groupId && groups.has(element.groupId)).map((element) => element.id)]));
}

export function moveElements(elements: EditorElement[], ids: string[], dx: number, dy: number) {
  const wanted = new Set(ids);
  return elements.map((element) => wanted.has(element.id) ? moveElement(element, dx, dy) : element);
}

export function duplicateElements(elements: EditorElement[], ids: string[]) {
  const chosen = selectedElements(elements, ids);
  const groupMap = new Map<string, string>();
  const copies = chosen.map((element) => {
    const copy = duplicateElement(element);
    if (element.groupId) {
      if (!groupMap.has(element.groupId)) groupMap.set(element.groupId, createId("group"));
      copy.groupId = groupMap.get(element.groupId);
    }
    return copy;
  });
  return { elements: [...elements, ...copies], ids: copies.map((copy) => copy.id) };
}


export type SelectionBounds = { x:number; y:number; width:number; height:number; centerX:number; centerY:number };

export function selectionBounds(elements: EditorElement[], ids: string[]): SelectionBounds | null {
  const chosen=selectedElements(elements,ids);
  if(!chosen.length) return null;
  const left=Math.min(...chosen.map(e=>e.x)), top=Math.min(...chosen.map(e=>e.y));
  const right=Math.max(...chosen.map(e=>e.x+e.width)), bottom=Math.max(...chosen.map(e=>e.y+e.height));
  return {x:left,y:top,width:right-left,height:bottom-top,centerX:(left+right)/2,centerY:(top+bottom)/2};
}

export function transformElements(
  elements: EditorElement[], ids: string[], original: EditorElement[], mode:"move"|"resize"|"rotate",
  dx:number, dy:number, rotationDelta=0
) {
  const wanted=new Set(ids);
  const bounds=selectionBounds(original,ids);
  if(!bounds) return elements;
  const originalMap=new Map(original.map(e=>[e.id,e]));
  if(mode==="move") return elements.map(e=>wanted.has(e.id)&&!e.locked?{...e,x:(originalMap.get(e.id)?.x??e.x)+dx,y:(originalMap.get(e.id)?.y??e.y)+dy}:e);
  if(mode==="resize"){
    const sx=Math.max(.05,(bounds.width+dx)/Math.max(1,bounds.width));
    const sy=Math.max(.05,(bounds.height+dy)/Math.max(1,bounds.height));
    return elements.map(e=>{const o=originalMap.get(e.id);if(!wanted.has(e.id)||!o||e.locked)return e;return {...e,x:bounds.x+(o.x-bounds.x)*sx,y:bounds.y+(o.y-bounds.y)*sy,width:Math.max(20,o.width*sx),height:Math.max(20,o.height*sy)};});
  }
  const radians=rotationDelta*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians);
  return elements.map(e=>{const o=originalMap.get(e.id);if(!wanted.has(e.id)||!o||e.locked)return e;const cx=o.x+o.width/2-bounds.centerX,cy=o.y+o.height/2-bounds.centerY;const rx=cx*cos-cy*sin,ry=cx*sin+cy*cos;return {...e,x:bounds.centerX+rx-o.width/2,y:bounds.centerY+ry-o.height/2,rotation:((o.rotation+rotationDelta)%360+360)%360};});
}
