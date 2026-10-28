import { isFramePresetId, MIN_FRAME_WEIGHT, MAX_FRAME_WEIGHT } from "./frames.ts";
import { bundledFontById } from "./bundledFonts.ts";

/**
 * PRINTS layers are design-relative and independent of sheet/imposition position.
 * x/y/width/height represent normalized fractions of the current print item.
 */
export interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  /** Nondestructive alpha for this vector overlay (0 fully transparent, 1 opaque). */
  opacity?: number;
}
export interface TextLayer extends LayerBase {
  kind: "text";
  text: string;
  fontSizePt: number;
  fontFamily?: "Helvetica"|"TimesRoman"|"Courier";
  /** Stable ID of a locally bundled font, embedded into PDFs on export. */
  bundledFontId?: string;
  /** User-provided TTF/OTF, embedded per-project and subset in PDFs. */
  fontData?: string;
  fontName?: string;
  align?: "left"|"center"|"right";
  lineHeightFactor?:number;
  outlinePt?:number;
  outlineColor?:string;
  shadowPt?:number;
  shadowColor?:string;
}
export interface ShapeLayer extends LayerBase {
  kind: "rectangle" | "ellipse";
}
/** A decorative frame always covers the whole printable design. */
export interface FrameLayer extends LayerBase {
  kind: "frame";
  frameId: string;
  weight: number;
}
export type DesignLayer = TextLayer | ShapeLayer | FrameLayer;
export const MAX_DESIGN_LAYERS = 100;

export function parseHexColor(input: string): readonly [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(input)) throw new Error("Layer color must be a six-digit hex value.");
  return [
    parseInt(input.slice(1, 3), 16) / 255,
    parseInt(input.slice(3, 5), 16) / 255,
    parseInt(input.slice(5, 7), 16) / 255,
  ];
}

export function validDesignLayers(input: unknown): input is DesignLayer[] {
  if (!Array.isArray(input) || input.length > MAX_DESIGN_LAYERS) return false;
  const ids = new Set<string>();
  let hasFrame = false;
  return input.every((value) => {
    if (!value || typeof value !== "object") return false;
    const l = value as Record<string, unknown>;
    if (typeof l.id !== "string" || !l.id || ids.has(l.id) ||
        typeof l.name !== "string" || l.name.length > 100 ||
        typeof l.visible !== "boolean" || typeof l.color !== "string" ||
        !/^#[0-9a-fA-F]{6}$/.test(l.color)) return false;
    ids.add(l.id);
    if(l.opacity!==undefined && (typeof l.opacity!=="number"||!Number.isFinite(l.opacity)||
      l.opacity<0||l.opacity>1))return false;
    if (!["text", "rectangle", "ellipse", "frame"].includes(String(l.kind)) ||
      !["x", "y", "width", "height"].every((key) => {
        const n = l[key];
        return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
      }) || (l.width as number) <= 0 || (l.height as number) <= 0 ||
      (l.x as number) + (l.width as number) > 1.000001 ||
      (l.y as number) + (l.height as number) > 1.000001) return false;
    if (l.kind === "frame") {
      if (hasFrame) return false;
      hasFrame = true;
      return l.x === 0 && l.y === 0 && l.width === 1 && l.height === 1 &&
        typeof l.frameId === "string" && isFramePresetId(l.frameId) &&
        typeof l.weight === "number" && Number.isFinite(l.weight) &&
        l.weight >= MIN_FRAME_WEIGHT && l.weight <= MAX_FRAME_WEIGHT;
    }
    return l.kind !== "text" ||
      (typeof l.text === "string" && l.text.length <= 300 &&
      typeof l.fontSizePt === "number" && Number.isFinite(l.fontSizePt) &&
      l.fontSizePt >= 4 && l.fontSizePt <= 180 &&
      (l.fontFamily===undefined||["Helvetica","TimesRoman","Courier"].includes(String(l.fontFamily))) &&
      (l.bundledFontId===undefined || (typeof l.bundledFontId==="string" &&
        !!bundledFontById(l.bundledFontId) && l.fontData===undefined)) &&
      (l.fontData===undefined || (typeof l.fontData==="string"&&l.fontData.length<=1_600_000&&
        /^data:font\/(ttf|otf);base64,[A-Za-z0-9+/]+={0,2}$/.test(l.fontData))) &&
      (l.fontName===undefined||(typeof l.fontName==="string"&&l.fontName.length<=100))&&
      (l.align===undefined||["left","center","right"].includes(String(l.align))) &&
      (l.lineHeightFactor===undefined||(typeof l.lineHeightFactor==="number"&&
        Number.isFinite(l.lineHeightFactor)&&l.lineHeightFactor>=1&&l.lineHeightFactor<=2)) &&
      (l.outlinePt===undefined||(typeof l.outlinePt==="number"&&Number.isFinite(l.outlinePt)&&
        l.outlinePt>=0&&l.outlinePt<=4)) &&
      (l.outlineColor===undefined||(typeof l.outlineColor==="string"&&/^#[0-9a-fA-F]{6}$/.test(l.outlineColor)))&&
      (l.shadowPt===undefined||(typeof l.shadowPt==="number"&&Number.isFinite(l.shadowPt)&&
        l.shadowPt>=0&&l.shadowPt<=12)) &&
      (l.shadowColor===undefined||(typeof l.shadowColor==="string"&&/^#[0-9a-fA-F]{6}$/.test(l.shadowColor))));
  });
}

export function newLayer(kind: Exclude<DesignLayer["kind"], "frame">): DesignLayer {
  const base = { id: crypto.randomUUID(), name: kind === "text" ? "Caption" : kind,
    visible: true, x: .08, y: .08, width: .7, height: .20, color: "#0b1725" };
  if (kind === "text") return { ...base, kind, text: "Your text", fontSizePt: 12 };
  return { ...base, kind };
}

export function newFrameLayer(frameId: string): FrameLayer {
  if (!isFramePresetId(frameId)) throw new Error("Unknown frame design.");
  return { id: crypto.randomUUID(), name: "Frame", kind: "frame", frameId, weight: 1,
    visible: true, x: 0, y: 0, width: 1, height: 1, color: "#ffffff" };
}

/** Switching styles preserves frame order and styling; a new frame sits behind text. */
export function setFramePreset(layers: readonly DesignLayer[], frameId: string): DesignLayer[] {
  if (!isFramePresetId(frameId)) throw new Error("Unknown frame design.");
  const existing = layers.find(layer => layer.kind === "frame");
  if (existing) return layers.map(layer => layer.id === existing.id && layer.kind === "frame"
    ? { ...layer, frameId, visible: true } : layer);
  if (layers.length >= MAX_DESIGN_LAYERS) throw new Error("Remove a layer before adding a frame.");
  return [newFrameLayer(frameId), ...layers];
}

/** Convert normalized object coordinates into print-system millimeters. */
export function layerRectMm(
  layer: DesignLayer, placement: { xMm: number; yMm: number; widthMm: number; heightMm: number },
) {
  return {
    xMm: placement.xMm + layer.x * placement.widthMm,
    yMm: placement.yMm + layer.y * placement.heightMm,
    widthMm: layer.width * placement.widthMm,
    heightMm: layer.height * placement.heightMm,
  };
}
