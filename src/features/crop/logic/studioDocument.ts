import type { CropRegion, CropShape, ShapePoint } from "../../../domain/models/crop.ts";
import { validCropShape } from "../../../domain/models/crop.ts";
import { isFramePresetId } from "../../frames/logic/frames.ts";
import { validCropRegion, validCustomPolygon, validPerspectiveQuad } from "./studioGeometry.ts";
import {validBezierHandles,type BezierHandles} from "./bezierContour.ts";

export const CROP_STUDIO_SCHEMA_VERSION = 2 as const;
export interface CropStudioDocument {
  schemaVersion: typeof CROP_STUDIO_SCHEMA_VERSION;
  /** One source-space rectangle for one image, never a region collection. */
  crop: CropRegion;
  aspect: { locked: boolean; ratio: number };
  shape: { preset: CropShape | "custom"; vertices?: ShapePoint[];
    bezierHandles?:BezierHandles[]; rotationDeg: number;
    flipX: boolean; flipY: boolean; cornerCurvature: number };
  imageTransform: { rotationDeg: number; flipX: boolean; flipY: boolean;
    skewXDeg: number; skewYDeg: number; perspective?: [ShapePoint, ShapePoint, ShapePoint, ShapePoint] };
  cropTransform: { rotationDeg: number; flipX: boolean; flipY: boolean };
  frame: { presetId?: string; bounds: CropRegion; rotationDeg: number;
    fit: "fit" | "fill"; imageOffsetX: number; imageOffsetY: number; imageScale: number;
    borderThicknessMm: number; borderColor: string; borderOpacity: number;
    radiusMm: number; backgroundColor?: string; backgroundOpacity: number;
    shadowColor: string; shadowOpacity: number; shadowBlurMm: number;
    shadowOffsetXMm: number; shadowOffsetYMm: number };
  output: { widthMm: number; heightMm: number; dpi: number };
}

const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const color = (value: unknown): value is string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const bool = (value: unknown): value is boolean => typeof value === "boolean";
const positive = (value: unknown, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 && value <= max;
/** Shear matrix [1, tan(x); tan(y), 1] must stay invertible and well-conditioned. */
const validSkewPair = (x: number, y: number): boolean =>
  1 - Math.tan(x * Math.PI / 180) * Math.tan(y * Math.PI / 180) >= 0.05;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const only = (r: Record<string, unknown>, names: readonly string[]) =>
  Object.keys(r).every(k => names.includes(k));
const required = (r: Record<string, unknown>, names: readonly string[]) =>
  names.every(k => Object.prototype.hasOwnProperty.call(r, k));

export function validCropStudioDocument(input: unknown): input is CropStudioDocument {
  if (!record(input) || input.schemaVersion !== CROP_STUDIO_SCHEMA_VERSION ||
    !only(input, ["schemaVersion", "crop", "aspect", "shape", "imageTransform",
      "cropTransform", "frame", "output"]) ||
    !required(input, ["crop", "aspect", "shape", "imageTransform", "cropTransform", "frame", "output"]) ||
    !validCropRegion(input.crop)) return false;
  const { aspect, shape, imageTransform: im, cropTransform: ct, frame, output } = input;
  if (!record(aspect) || !only(aspect, ["locked", "ratio"]) ||
    !required(aspect, ["locked", "ratio"]) ||
    !bool(aspect.locked) || !positive(aspect.ratio, Number.MAX_VALUE)) return false;
  if (!record(shape) || !only(shape, ["preset", "vertices", "bezierHandles", "rotationDeg", "flipX", "flipY", "cornerCurvature"]) ||
    !required(shape, ["preset", "rotationDeg", "flipX", "flipY", "cornerCurvature"]) ||
    !(validCropShape(shape.preset) || shape.preset === "custom") ||
    !finite(shape.rotationDeg, -180, 180) || !bool(shape.flipX) || !bool(shape.flipY) ||
    !finite(shape.cornerCurvature, 0, 0.5) ||
    (shape.preset === "custom" && (!validCustomPolygon(shape.vertices) ||
      shape.vertices!.length > 128)) ||
    (shape.bezierHandles!==undefined && (
      shape.preset!=="custom" || !validBezierHandles(shape.bezierHandles,
        shape.vertices as ShapePoint[]))) ||
    (shape.preset !== "custom" && shape.vertices !== undefined)) return false;
  if (!record(im) || !only(im, ["rotationDeg", "flipX", "flipY", "skewXDeg", "skewYDeg", "perspective"]) ||
    !required(im, ["rotationDeg", "flipX", "flipY", "skewXDeg", "skewYDeg"]) ||
    !finite(im.rotationDeg, -180, 180) || !bool(im.flipX) || !bool(im.flipY) ||
    !finite(im.skewXDeg, -45, 45) || !finite(im.skewYDeg, -45, 45) ||
    !validSkewPair(im.skewXDeg, im.skewYDeg) ||
    (im.perspective !== undefined && !validPerspectiveQuad(im.perspective))) return false;
  if (!record(ct) || !only(ct, ["rotationDeg", "flipX", "flipY"]) ||
    !required(ct, ["rotationDeg", "flipX", "flipY"]) ||
    !finite(ct.rotationDeg, -180, 180) || !bool(ct.flipX) || !bool(ct.flipY)) return false;
  if (!record(frame) || !only(frame, ["presetId", "bounds", "rotationDeg", "fit",
    "imageOffsetX", "imageOffsetY", "imageScale",
    "borderThicknessMm", "borderColor", "borderOpacity", "radiusMm",
    "backgroundColor", "backgroundOpacity", "shadowColor", "shadowOpacity",
    "shadowBlurMm", "shadowOffsetXMm", "shadowOffsetYMm"]) ||
    !required(frame, ["bounds", "rotationDeg", "fit", "imageOffsetX",
      "imageOffsetY", "imageScale", "borderThicknessMm", "borderColor",
      "borderOpacity", "radiusMm", "backgroundOpacity", "shadowColor",
      "shadowOpacity", "shadowBlurMm", "shadowOffsetXMm", "shadowOffsetYMm"]) ||
    (frame.presetId !== undefined && !isFramePresetId(frame.presetId)) ||
    !validCropRegion(frame.bounds) || !finite(frame.rotationDeg, -180, 180) ||
    (frame.fit !== "fit" && frame.fit !== "fill") ||
    !finite(frame.imageOffsetX, -2, 2) || !finite(frame.imageOffsetY, -2, 2) ||
    !finite(frame.imageScale, 0.1, 20) ||
    !finite(frame.borderThicknessMm, 0, 50) || !color(frame.borderColor) ||
    !finite(frame.borderOpacity, 0, 1) || !finite(frame.radiusMm, 0, 1000) ||
    (frame.backgroundColor !== undefined && !color(frame.backgroundColor)) ||
    !finite(frame.backgroundOpacity, 0, 1) || !color(frame.shadowColor) ||
    !finite(frame.shadowOpacity, 0, 1) || !finite(frame.shadowBlurMm, 0, 100) ||
    !finite(frame.shadowOffsetXMm, -100, 100) ||
    !finite(frame.shadowOffsetYMm, -100, 100) ||
    (frame.backgroundOpacity > 0 && frame.backgroundColor === undefined)) return false;
  if (!record(output) || !only(output, ["widthMm", "heightMm", "dpi"]) ||
    !required(output, ["widthMm", "heightMm", "dpi"]) ||
    !positive(output.widthMm, 2000) || !positive(output.heightMm, 2000) ||
    !Number.isSafeInteger(output.dpi) || !finite(output.dpi, 72, 1200)) return false;
  if (aspect.locked) {
    const ratio = output.widthMm / output.heightMm;
    if (!Number.isFinite(ratio) || ratio <= 0 ||
      Math.abs(aspect.ratio / ratio - 1) > 1e-6) return false;
  }
  const frameShortSideMm = Math.min(output.widthMm * frame.bounds.width,
    output.heightMm * frame.bounds.height);
  if (frame.borderThicknessMm * 2 > frameShortSideMm + 1e-9 ||
    frame.radiusMm * 2 > frameShortSideMm + 1e-9) return false;
  return true;
}

/** Upgrade only metadata; don't bake legacy photo adjustments or vector layers
 * into the new document: they remain authoritative until the raster/print
 * pipeline is switched atomically to v2, avoiding double transformations. */
export function migrateLegacyCropStudio(legacy: {
  crop: CropRegion; cropShape?: CropShape; widthMm: number;
  heightMm: number; dpi?: number;
}): CropStudioDocument {
  if (!validCropRegion(legacy.crop) ||
    (legacy.cropShape !== undefined && !validCropShape(legacy.cropShape)) ||
    !positive(legacy.widthMm, 2000) || !positive(legacy.heightMm, 2000) ||
    !Number.isSafeInteger(legacy.dpi ?? 300) || !finite(legacy.dpi ?? 300, 72, 1200))
    throw new Error("Invalid legacy crop metadata.");
  const doc: CropStudioDocument = {
    schemaVersion: CROP_STUDIO_SCHEMA_VERSION,
    crop: { ...legacy.crop },
    aspect: { locked: true, ratio: legacy.widthMm / legacy.heightMm },
    shape: { preset: legacy.cropShape ?? "rectangle", rotationDeg: 0,
      flipX: false, flipY: false, cornerCurvature: 0 },
    imageTransform: { rotationDeg: 0, flipX: false, flipY: false, skewXDeg: 0, skewYDeg: 0 },
    cropTransform: { rotationDeg: 0, flipX: false, flipY: false },
    frame: { bounds: { x: 0, y: 0, width: 1, height: 1 }, rotationDeg: 0,
      fit: "fill", imageOffsetX: 0, imageOffsetY: 0, imageScale: 1,
      borderThicknessMm: 0, borderColor: "#ffffff", borderOpacity: 1,
      radiusMm: 0, backgroundOpacity: 0,
      shadowColor: "#000000", shadowOpacity: 0,
      shadowBlurMm: 0, shadowOffsetXMm: 0, shadowOffsetYMm: 0 },
    output: { widthMm: legacy.widthMm, heightMm: legacy.heightMm, dpi: legacy.dpi ?? 300 },
  };
  if (!validCropStudioDocument(doc)) throw new Error("Crop migration failed validation.");
  return doc;
}

/** Print modes and Smart ID may resize a reusable design without rewriting its
 * source asset. Resolve its one authoritative physical output at render time,
 * preserving original project metadata and all independent editing controls. */
export function studioForOutput(doc:CropStudioDocument|undefined,
  crop:CropRegion,widthMm:number,heightMm:number):CropStudioDocument|undefined{
  if(!doc)return undefined;
  if(!validCropRegion(crop)||![widthMm,heightMm].every(v=>Number.isFinite(v)&&v>0&&v<=2000))
    throw new Error("Invalid print-mode crop or physical dimensions.");
  if(doc.crop.x===crop.x&&doc.crop.y===crop.y&&
    doc.crop.width===crop.width&&doc.crop.height===crop.height&&
    doc.output.widthMm===widthMm&&doc.output.heightMm===heightMm)return doc;
  const updated:CropStudioDocument={...doc,crop:{...crop},
    aspect:{locked:true,ratio:widthMm/heightMm},
    output:{...doc.output,widthMm,heightMm}};
  if(!validCropStudioDocument(updated))
    throw new Error("Crop frame is incompatible with these physical dimensions.");
  return updated;
}
