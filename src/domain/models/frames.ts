/**
 * Print-local, vector frame designs. Coordinates and stroke widths are in mm
 * with a top-left origin. Motifs use the shorter side as their unit, so corners
 * and ornaments retain their proportions on portrait and landscape designs.
 */
export type FrameCategory =
  | "Minimal"
  | "Classic"
  | "Geometric"
  | "Botanical"
  | "Celebratory"
  | "Christmas"
  | "Winter"
  | "Summer"
  | "Halloween"
  | "Spring"
  | "Autumn";

export interface FramePreset {
  id: string;
  name: string;
  category: FrameCategory;
}

export interface FramePoint {
  x: number;
  y: number;
}

export type FrameStroke = {
  strokeWidth: number;
  /** Curated motif accent; the frame rail still uses the user-selected color. */
  accentColor?: string;
};

export type FramePrimitive =
  | (FrameStroke & { kind: "line"; x1: number; y1: number; x2: number; y2: number })
  | (FrameStroke & { kind: "rect"; x: number; y: number; width: number; height: number; fill?: boolean })
  | (FrameStroke & { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; fill?: boolean })
  | (FrameStroke & { kind: "polyline"; points: FramePoint[] })
  | (FrameStroke & { kind: "polygon"; points: FramePoint[]; fill?: boolean });

export const MIN_FRAME_WEIGHT = 0.5;
export const MAX_FRAME_WEIGHT = 2.5;
