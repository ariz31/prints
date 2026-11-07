import type { CropRegion, ShapePoint } from "../../../domain/models/crop.ts";

export type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

/** Crop coordinates are fractions of the source, not CSS pixels. */
export function validCropRegion(value: unknown): value is CropRegion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  if (!["x", "y", "width", "height"].every(key =>
    typeof r[key] === "number" && Number.isFinite(r[key]))) return false;
  const { x, y, width, height } = r as unknown as CropRegion;
  return x >= 0 && y >= 0 && width > 0 && height > 0 &&
    x + width <= 1.00000001 && y + height <= 1.00000001;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/** Move a single source-space crop; never change its physical aspect ratio. */
export function moveCropRegion(crop: CropRegion, dx: number, dy: number): CropRegion {
  if (!validCropRegion(crop) || ![dx, dy].every(Number.isFinite))
    throw new Error("Invalid crop positioning.");
  return { ...crop, x: clamp(crop.x + dx, 0, 1 - crop.width),
    y: clamp(crop.y + dy, 0, 1 - crop.height) };
}

/**
 * Resize against the opposite edge/corner. For an edge with aspect lock,
 * the perpendicular dimension grows symmetrically around its center.
 * A corner maintains the opposite corner as the fixed anchor.
 * The caller must update the physical output dimensions before exporting
 * an unlocked crop; legacy exactCropSourceRect intentionally rejects mismatch.
 */
export function resizeCropRegion(
  crop: CropRegion, handle: ResizeHandle, dx: number, dy: number,
  options: { ratio?: number; minExtent?: number } = {},
): CropRegion {
  if (!validCropRegion(crop) || ![dx, dy].every(Number.isFinite))
    throw new Error("Invalid crop resizing.");
  const minExtent = options.minExtent ?? 0.01;
  if (!Number.isFinite(minExtent) || minExtent <= 0 || minExtent > 0.5)
    throw new Error("Invalid minimum crop size.");
  const ratio = options.ratio;
  if (ratio !== undefined && (!Number.isFinite(ratio) || ratio <= 0))
    throw new Error("Invalid crop aspect ratio.");
  const sx = handle.includes("w") ? -1 : handle.includes("e") ? 1 : 0;
  const sy = handle.includes("n") ? -1 : handle.includes("s") ? 1 : 0;
  if (!sx && !sy) throw new Error("Unknown crop resize handle.");
  const ax = sx < 0 ? crop.x + crop.width : sx > 0 ? crop.x : crop.x + crop.width / 2;
  const ay = sy < 0 ? crop.y + crop.height : sy > 0 ? crop.y : crop.y + crop.height / 2;
  let w = sx ? crop.width + sx * dx : crop.width;
  let h = sy ? crop.height + sy * dy : crop.height;
  const maxW = sx < 0 ? ax : sx > 0 ? 1 - ax : 2 * Math.min(ax, 1 - ax);
  const maxH = sy < 0 ? ay : sy > 0 ? 1 - ay : 2 * Math.min(ay, 1 - ay);
  if (ratio !== undefined) {
    if (sx && sy) {
      // Dominant pointer axis controls the locked size; aspect never drifts.
      w = Math.abs(dx) >= Math.abs(dy * ratio) ? w : h * ratio;
    } else if (sy) w = h * ratio;
    h = w / ratio;
    const lowerW = Math.max(minExtent, minExtent * ratio);
    const upperW = Math.min(maxW, maxH * ratio);
    if (upperW < lowerW) return crop;
    w = clamp(w, lowerW, upperW);
    h = w / ratio;
  } else {
    if (maxW < minExtent || maxH < minExtent) return crop;
    w = clamp(w, minExtent, maxW);
    h = clamp(h, minExtent, maxH);
  }
  const x = sx < 0 ? ax - w : sx > 0 ? ax : ax - w / 2;
  const y = sy < 0 ? ay - h : sy > 0 ? ay : ay - h / 2;
  const result = { x, y, width: w, height: h };
  if (!validCropRegion(result)) throw new Error("Crop escaped image bounds.");
  return result;
}

const cross = (a: ShapePoint, b: ShapePoint, c: ShapePoint) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const EPS = 1e-10;
function onSegment(p: ShapePoint, a: ShapePoint, b: ShapePoint): boolean {
  return Math.abs(cross(a, b, p)) <= EPS &&
    p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS &&
    p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS;
}
function intersect(a: ShapePoint, b: ShapePoint, c: ShapePoint, d: ShapePoint): boolean {
  const ab1 = cross(a, b, c), ab2 = cross(a, b, d);
  const cd1 = cross(c, d, a), cd2 = cross(c, d, b);
  if ((ab1 > EPS && ab2 < -EPS || ab1 < -EPS && ab2 > EPS) &&
      (cd1 > EPS && cd2 < -EPS || cd1 < -EPS && cd2 > EPS)) return true;
  return (Math.abs(ab1) <= EPS && onSegment(c, a, b)) ||
    (Math.abs(ab2) <= EPS && onSegment(d, a, b)) ||
    (Math.abs(cd1) <= EPS && onSegment(a, c, d)) ||
    (Math.abs(cd2) <= EPS && onSegment(b, c, d));
}
export function signedPolygonArea(points: readonly ShapePoint[]): number {
  return points.reduce((total, a, index) => {
    const b = points[(index + 1) % points.length];
    return total + a.x * b.y - b.x * a.y;
  }, 0) / 2;
}

/** Concave closed polygons are valid; bowties, zero edges and tiny areas are not. */
export function validCustomPolygon(input: unknown): input is ShapePoint[] {
  if (!Array.isArray(input) || input.length < 3 || input.length > 128) return false;
  const points = input as ShapePoint[];
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    if (!p || !q || ![p.x, p.y, q.x, q.y].every(Number.isFinite) ||
      [p.x, p.y, q.x, q.y].some(n => n < 0 || n > 1) ||
      Math.hypot(p.x - q.x, p.y - q.y) < 0.00001) return false;
  }
  if (Math.abs(signedPolygonArea(points)) < 0.0001) return false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (intersect(a, b, points[j], points[(j + 1) % points.length])) return false;
    }
  }
  return true;
}

/** Four-corner homography requires a strictly convex, non-degenerate quad. */
export function validPerspectiveQuad(input: unknown): input is [ShapePoint, ShapePoint, ShapePoint, ShapePoint] {
  if (!validCustomPolygon(input) || input.length !== 4) return false;
  const signs = input.map((p, i) =>
    cross(p, input[(i + 1) % 4], input[(i + 2) % 4]));
  return signs.every(v => v > 0.0001) || signs.every(v => v < -0.0001);
}

/** Pixel density estimates are advisory; never silently upsample originals. */
export function effectiveCropDpi(
  imageWidthPx: number, imageHeightPx: number, crop: CropRegion,
  outputWidthMm: number, outputHeightMm: number,
): number {
  if (!validCropRegion(crop) || ![imageWidthPx, imageHeightPx, outputWidthMm, outputHeightMm]
    .every(value => Number.isFinite(value) && value > 0))
    throw new Error("Invalid crop resolution dimensions.");
  return Math.min(imageWidthPx * crop.width * 25.4 / outputWidthMm,
    imageHeightPx * crop.height * 25.4 / outputHeightMm);
}
