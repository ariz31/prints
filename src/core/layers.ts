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
}
export interface TextLayer extends LayerBase {
  kind: "text";
  text: string;
  fontSizePt: number;
}
export interface ShapeLayer extends LayerBase {
  kind: "rectangle" | "ellipse";
}
export type DesignLayer = TextLayer | ShapeLayer;

export function parseHexColor(input: string): readonly [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(input)) throw new Error("Layer color must be a six-digit hex value.");
  return [
    parseInt(input.slice(1, 3), 16) / 255,
    parseInt(input.slice(3, 5), 16) / 255,
    parseInt(input.slice(5, 7), 16) / 255,
  ];
}

export function validDesignLayers(input: unknown): input is DesignLayer[] {
  if (!Array.isArray(input) || input.length > 100) return false;
  const ids = new Set<string>();
  return input.every((value) => {
    if (!value || typeof value !== "object") return false;
    const l = value as Record<string, unknown>;
    if (typeof l.id !== "string" || !l.id || ids.has(l.id) ||
        typeof l.name !== "string" || l.name.length > 100 ||
        typeof l.visible !== "boolean" || typeof l.color !== "string" ||
        !/^#[0-9a-fA-F]{6}$/.test(l.color)) return false;
    ids.add(l.id);
    if (!["text", "rectangle", "ellipse"].includes(String(l.kind)) ||
      !["x", "y", "width", "height"].every((key) => {
        const n = l[key];
        return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
      }) || (l.width as number) <= 0 || (l.height as number) <= 0 ||
      (l.x as number) + (l.width as number) > 1.000001 ||
      (l.y as number) + (l.height as number) > 1.000001) return false;
    return l.kind !== "text" ||
      (typeof l.text === "string" && l.text.length <= 300 &&
      typeof l.fontSizePt === "number" && Number.isFinite(l.fontSizePt) &&
      l.fontSizePt >= 4 && l.fontSizePt <= 180);
  });
}

export function newLayer(kind: DesignLayer["kind"]): DesignLayer {
  const base = { id: crypto.randomUUID(), name: kind === "text" ? "Caption" : kind,
    visible: true, x: .08, y: .08, width: .7, height: .20, color: "#0b1725" };
  if (kind === "text") return { ...base, kind, text: "Your text", fontSizePt: 12 };
  return { ...base, kind };
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
