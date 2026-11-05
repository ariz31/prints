/**
 * Smartphone-style crop: a stationary print frame with the image moved
 * and zoomed underneath. Normalized source coordinates are authoritative.
 */
export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const FULL_CROP: CropRegion = { x: 0, y: 0, width: 1, height: 1 };

/** Fifteen non-destructive print crop contours. Coordinates are local [0,1]. */
export const CROP_SHAPES = [
  { id: "rectangle", label: "Rectangle" },
  { id: "rounded", label: "Rounded rectangle" },
  { id: "circle", label: "Circle" },
  { id: "oval", label: "Oval" },
  { id: "triangle", label: "Triangle" },
  { id: "right-triangle", label: "Right triangle" },
  { id: "diamond", label: "Diamond" },
  { id: "pentagon", label: "Pentagon" },
  { id: "hexagon", label: "Hexagon" },
  { id: "octagon", label: "Octagon" },
  { id: "star", label: "Five-point star" },
  { id: "star-six", label: "Six-point star" },
  { id: "heart", label: "Heart" },
  { id: "shield", label: "Shield" },
  { id: "scallop", label: "Scalloped circle" },
] as const;

export type CropShape = (typeof CROP_SHAPES)[number]["id"];

export type ShapePoint = { x: number; y: number };

export function validCropShape(value: unknown): value is CropShape {
  return typeof value === "string" && CROP_SHAPES.some((s) => s.id === value);
}
