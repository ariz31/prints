import {
  CROP_SHAPES,
  validCropShape,
  type CropShape,
  type ShapePoint,
} from "../../../domain/models/crop.ts";
import {validCustomPolygon} from "./studioGeometry.ts";

export {
  CROP_SHAPES,
  validCropShape,
  type CropShape,
  type ShapePoint,
};

const point = (x: number, y: number): ShapePoint => ({ x, y });

function regular(sides: number, phase = -Math.PI / 2): ShapePoint[] {
  return Array.from({ length: sides }, (_, i) => {
    const theta = phase + (i * 2 * Math.PI) / sides;
    return point(0.5 + 0.5 * Math.cos(theta), 0.5 + 0.5 * Math.sin(theta));
  });
}

function star(points: number): ShapePoint[] {
  return Array.from({ length: points * 2 }, (_, i) => {
    const theta = -Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 ? 0.24 : 0.5;
    return point(0.5 + r * Math.cos(theta), 0.5 + r * Math.sin(theta));
  });
}

function oval(segments = 48): ShapePoint[] {
  return Array.from({ length: segments }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / segments;
    return point(0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a));
  });
}

function rounded(): ShapePoint[] {
  const points: ShapePoint[] = [];
  for (const [cx, cy, a] of [
    [0.85, 0.15, -Math.PI / 2],
    [0.85, 0.85, 0],
    [0.15, 0.85, Math.PI / 2],
    [0.15, 0.15, Math.PI],
  ]) {
    for (let i = 0; i <= 7; i++) {
      const theta = a + (i * Math.PI) / 14;
      points.push(point(cx + 0.15 * Math.cos(theta), cy + 0.15 * Math.sin(theta)));
    }
  }
  return points;
}

function heart(): ShapePoint[] {
  const raw = Array.from({ length: 60 }, (_, i) => {
    const t = (2 * Math.PI * i) / 60;
    return point(
      16 * Math.pow(Math.sin(t), 3),
      13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
    );
  });
  const minX = Math.min(...raw.map(p => p.x));
  const maxX = Math.max(...raw.map(p => p.x));
  const minY = Math.min(...raw.map(p => p.y));
  const maxY = Math.max(...raw.map(p => p.y));
  return raw.map(p => point((p.x - minX) / (maxX - minX), (maxY - p.y) / (maxY - minY)));
}

function computeRawCropShapePoints(shape: CropShape | undefined): ShapePoint[] {
  switch (shape) {
    case undefined:
    case "rectangle":
      return [point(0, 0), point(1, 0), point(1, 1), point(0, 1)];
    case "rounded":
      return rounded();
    case "circle":
    case "oval":
      return oval();
    case "triangle":
      return [point(0.5, 0), point(1, 1), point(0, 1)];
    case "right-triangle":
      return [point(0, 0), point(1, 1), point(0, 1)];
    case "diamond":
      return [point(0.5, 0), point(1, 0.5), point(0.5, 1), point(0, 0.5)];
    case "pentagon":
      return regular(5);
    case "hexagon":
      return regular(6);
    case "octagon":
      return regular(8);
    case "star":
      return star(5);
    case "star-six":
      return star(6);
    case "heart":
      return heart();
    case "shield":
      return [
        point(0.08, 0),
        point(0.92, 0),
        point(0.92, 0.58),
        point(0.75, 0.81),
        point(0.5, 1),
        point(0.25, 0.81),
        point(0.08, 0.58),
      ];
    case "scallop":
      return Array.from({ length: 72 }, (_, i) => {
        const angle = -Math.PI / 2 + (i * Math.PI) / 36;
        const r = 0.455 + 0.045 * Math.cos(12 * angle);
        return point(0.5 + r * Math.cos(angle), 0.5 + r * Math.sin(angle));
      });
  }
}

const NORMALIZED_CACHE = new Map<CropShape, readonly ShapePoint[]>();
export const STATIC_CLIP_PATH_CACHE = new Map<string, string | undefined>();
const AREA_FRACTION_CACHE = new Map<CropShape, number>();

export function getCachedCropShapePoints(shape: CropShape | undefined): readonly ShapePoint[] {
  const key = shape ?? "rectangle";
  let cached = NORMALIZED_CACHE.get(key);
  if (!cached) {
    cached = Object.freeze(computeRawCropShapePoints(shape));
    NORMALIZED_CACHE.set(key, cached);
  }
  return cached;
}

export function cropShapePoints(shape: CropShape | undefined,
  custom?: readonly ShapePoint[]): ShapePoint[] {
  if(custom!==undefined) {
    if(!validCustomPolygon(custom))throw new Error("Invalid custom crop shape.");
    return custom.map(p=>({x:p.x,y:p.y}));
  }
  return [...getCachedCropShapePoints(shape)];
}

export function shapeClipPath(shape: CropShape | undefined, rotated = false,
  custom?: readonly ShapePoint[]): string | undefined {
  if (custom !== undefined && !validCustomPolygon(custom)) throw new Error("Invalid custom crop shape.");
  if (custom === undefined && (!shape || shape === "rectangle")) return undefined;
  if (custom !== undefined) {
    return "polygon(" + custom.map(p =>
      rotated
        ? ((1-p.y)*100).toFixed(4)+"% "+(p.x*100).toFixed(4)+"%"
        : (p.x*100).toFixed(4)+"% "+(p.y*100).toFixed(4)+"%"
    ).join(",") + ")";
  }
  const cacheKey = `${shape}:${rotated}`;
  const existing = STATIC_CLIP_PATH_CACHE.get(cacheKey);
  if (existing !== undefined) return existing;
  const points = getCachedCropShapePoints(shape);
  const result =
    "polygon(" +
    points
      .map(p =>
        rotated
          ? ((1 - p.y) * 100).toFixed(3) + "% " + (p.x * 100).toFixed(3) + "%"
          : (p.x * 100).toFixed(3) + "% " + (p.y * 100).toFixed(3) + "%",
      )
      .join(",") +
    ")";
  STATIC_CLIP_PATH_CACHE.set(cacheKey, result);
  return result;
}

export function shapePolygonMm(
  shape: CropShape | undefined,
  xMm: number,
  yMm: number,
  widthMm: number,
  heightMm: number,
  rotated = false,
  custom?: readonly ShapePoint[],
): ShapePoint[] {
  if (custom !== undefined && !validCustomPolygon(custom))
    throw new Error("Invalid custom crop shape.");
  const base = custom ?? getCachedCropShapePoints(shape);
  const out: ShapePoint[] = new Array(base.length);
  for (let i = 0; i < base.length; i++) {
    const p = base[i];
    out[i] = rotated
      ? point(xMm + (1 - p.y) * widthMm, yMm + p.x * heightMm)
      : point(xMm + p.x * widthMm, yMm + p.y * heightMm);
  }
  return out;
}

export function polygonArea(poly: readonly ShapePoint[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

export function shapeAreaFraction(shape: CropShape | undefined,
  custom?: readonly ShapePoint[]): number {
  if(custom!==undefined) {
    if(!validCustomPolygon(custom))throw new Error("Invalid custom crop shape.");
    return polygonArea(custom);
  }
  const key = shape ?? "rectangle";
  const cached = AREA_FRACTION_CACHE.get(key);
  if (cached !== undefined) return cached;
  const calculated = polygonArea(getCachedCropShapePoints(shape));
  AREA_FRACTION_CACHE.set(key, calculated);
  return calculated;
}

/** Mask AFTER photo color/retouch processing to prevent source-dependent edge effects.
 * Coordinates are relative to the full output, even when clipping a raster tile. */
export function maskCropShape(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shape: CropShape | undefined,
  fullW: number,
  fullH: number,
  offsetX = 0,
  offsetY = 0,
  custom?: readonly ShapePoint[],
): void {
  if (custom === undefined && (!shape || shape === "rectangle")) return;
  if (custom !== undefined && !validCustomPolygon(custom))
    throw new Error("Invalid custom crop shape.");
  const points = custom ?? getCachedCropShapePoints(shape);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  points.forEach((p, i) =>
    i === 0
      ? ctx.moveTo(p.x * fullW - offsetX, p.y * fullH - offsetY)
      : ctx.lineTo(p.x * fullW - offsetX, p.y * fullH - offsetY),
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
