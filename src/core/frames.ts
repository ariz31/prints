import { SEASONAL_FRAME_PRESETS } from "./seasonalFrames.ts";
import { createPremiumFrameGeometry } from "./premiumFrameArt.ts";

/**
 * Print-local, vector frame designs. Coordinates and stroke widths are in mm
 * with a top-left origin. Motifs use the shorter side as their unit, so corners
 * and ornaments retain their proportions on portrait and landscape designs.
 */
export type FrameCategory = "Minimal" | "Classic" | "Geometric" | "Botanical" | "Celebratory" | "Christmas" | "Winter" | "Summer" | "Halloween" | "Spring" | "Autumn";
export interface FramePreset { id: string; name: string; category: FrameCategory }
export interface FramePoint { x: number; y: number }
type Stroke = { strokeWidth: number; /** Curated motif accent; the frame rail still uses the user-selected color. */ accentColor?: string };
export type FramePrimitive =
  | (Stroke & { kind: "line"; x1: number; y1: number; x2: number; y2: number })
  | (Stroke & { kind: "rect"; x: number; y: number; width: number; height: number; fill?: boolean })
  | (Stroke & { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; fill?: boolean })
  | (Stroke & { kind: "polyline"; points: FramePoint[] })
  | (Stroke & { kind: "polygon"; points: FramePoint[]; fill?: boolean });

/** IDs are persisted in projects: do not rename or reuse them. */
export const FRAME_PRESETS: readonly FramePreset[] = [
  { id: "hairline", name: "Hairline", category: "Minimal" },
  { id: "double-line", name: "Double line", category: "Minimal" },
  { id: "corner-lines", name: "Corner lines", category: "Minimal" },
  { id: "dashed", name: "Dashed", category: "Minimal" },
  { id: "dotted", name: "Dotted", category: "Minimal" },
  { id: "open-corners", name: "Open corners", category: "Minimal" },
  { id: "pinstripe", name: "Pinstripe", category: "Classic" },
  { id: "classic-corners", name: "Classic corners", category: "Classic" },
  { id: "deco", name: "Art deco", category: "Classic" },
  { id: "filigree", name: "Filigree", category: "Classic" },
  { id: "vintage-dots", name: "Vintage dots", category: "Classic" },
  { id: "stately", name: "Stately", category: "Classic" },
  { id: "diamonds", name: "Diamond chain", category: "Geometric" },
  { id: "triangles", name: "Triangle chain", category: "Geometric" },
  { id: "zigzag", name: "Zigzag", category: "Geometric" },
  { id: "squares", name: "Square chain", category: "Geometric" },
  { id: "hexagons", name: "Hexagon chain", category: "Geometric" },
  { id: "herringbone", name: "Herringbone", category: "Geometric" },
  { id: "leaf-tips", name: "Leaf tips", category: "Botanical" },
  { id: "corner-sprigs", name: "Corner sprigs", category: "Botanical" },
  { id: "leaf-garland", name: "Leaf garland", category: "Botanical" },
  { id: "flower-corners", name: "Flower corners", category: "Botanical" },
  { id: "floral-garland", name: "Floral garland", category: "Botanical" },
  { id: "vines", name: "Vines", category: "Botanical" },
  { id: "confetti", name: "Confetti", category: "Celebratory" },
  { id: "stars", name: "Stars", category: "Celebratory" },
  { id: "hearts", name: "Hearts", category: "Celebratory" },
  { id: "bunting", name: "Bunting", category: "Celebratory" },
  { id: "party-lights", name: "Party lights", category: "Celebratory" },
  { id: "sparkle", name: "Sparkle", category: "Celebratory" },
  ...SEASONAL_FRAME_PRESETS,
];
export const MIN_FRAME_WEIGHT = 0.5;
export const MAX_FRAME_WEIGHT = 2.5;
const frameIds = new Set(FRAME_PRESETS.map((preset) => preset.id));
export function isFramePresetId(value: unknown): value is string {
  return typeof value === "string" && frameIds.has(value);
}

/** All presets share original artist-directed geometry across SVG, Canvas and PDF.
 * Existing persisted IDs, weights, spacing and physical dimensions are stable.
 */
export function createFrameGeometry(
  id: string, widthMm: number, heightMm: number, weight = 1,
  options: { inset?: number; spacing?: number } = {},
): FramePrimitive[] {
  if (!isFramePresetId(id)) throw new Error("Unknown frame preset.");
  if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm <= 0 || heightMm <= 0)
    throw new Error("Frame dimensions must be positive and finite.");
  if (!Number.isFinite(weight) || weight < MIN_FRAME_WEIGHT || weight > MAX_FRAME_WEIGHT)
    throw new Error("Frame weight is outside its supported range.");
  const inset=options.inset??0, spacing=options.spacing??1;
  if (!Number.isFinite(inset)||inset<0||inset>.2||!Number.isFinite(spacing)||spacing<.5||spacing>2)
    throw new Error("Invalid frame inset or motif spacing.");
  const category = FRAME_PRESETS.find(preset => preset.id===id)!.category;
  return createPremiumFrameGeometry(id, category, widthMm, heightMm, weight, inset, spacing);
}
