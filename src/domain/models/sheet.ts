import type { CropShape } from "./crop.ts";

export const MM_PER_INCH = 25.4;
export const PDF_POINTS_PER_MM = 72 / MM_PER_INCH;

/** Physical sheet dimensions in mm (not a claim of printer compatibility). */
export const PAPER_SIZES = {
  A0: { widthMm: 841, heightMm: 1189 },
  A1: { widthMm: 594, heightMm: 841 },
  A2: { widthMm: 420, heightMm: 594 },
  A3: { widthMm: 297, heightMm: 420 },
  A4: { widthMm: 210, heightMm: 297 },
  A5: { widthMm: 148, heightMm: 210 },
  A6: { widthMm: 105, heightMm: 148 },
  A7: { widthMm: 74, heightMm: 105 },
  B4: { widthMm: 250, heightMm: 353 },
  B5: { widthMm: 176, heightMm: 250 },
  B6: { widthMm: 125, heightMm: 176 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
  Legal: { widthMm: 215.9, heightMm: 355.6 },
  Statement: { widthMm: 139.7, heightMm: 215.9 },
  Executive: { widthMm: 184.15, heightMm: 266.7 },
  "Long Bond": { widthMm: 215.9, heightMm: 330.2 },
  F4: { widthMm: 210, heightMm: 330 },
  Foolscap: { widthMm: 203.2, heightMm: 330.2 },
  "A3+": { widthMm: 329, heightMm: 483 },
  SRA3: { widthMm: 320, heightMm: 450 },
  Tabloid: { widthMm: 279.4, heightMm: 431.8 },
  "3R": { widthMm: 88.9, heightMm: 127 },
  "4R": { widthMm: 101.6, heightMm: 152.4 },
  "5R": { widthMm: 127, heightMm: 177.8 },
  "6R": { widthMm: 152.4, heightMm: 203.2 },
  "8R": { widthMm: 203.2, heightMm: 254 },
} as const;

export type PaperName = keyof typeof PAPER_SIZES | "Custom";
export type BuiltInPaperName = keyof typeof PAPER_SIZES;
export type Orientation = "portrait" | "landscape";

export const PAPER_GROUPS: readonly { label: string; papers: readonly BuiltInPaperName[] }[] = [
  { label: "ISO A", papers: ["A4", "A3", "A5", "A6", "A7", "A2", "A1", "A0"] },
  { label: "ISO B", papers: ["B4", "B5", "B6"] },
  { label: "US standard", papers: ["Letter", "Legal", "Statement", "Executive"] },
  { label: "Philippine / regional", papers: ["Long Bond", "F4", "Foolscap"] },
  { label: "Large format", papers: ["A3+", "SRA3", "Tabloid"] },
  { label: "Photo", papers: ["3R", "4R", "5R", "6R", "8R"] },
];

export function isPaperName(value: unknown): value is PaperName {
  return (
    typeof value === "string" &&
    (value === "Custom" || Object.prototype.hasOwnProperty.call(PAPER_SIZES, value))
  );
}

export interface PrintItemSpec {
  id: string;
  widthMm: number;
  heightMm: number;
  quantity: number;
  /** True only if its visual/text content can be rotated without changing semantics. */
  canRotate?: boolean;
  /** Optional non-rectangular printable contour; absent means legacy rectangle. */
  cropShape?: CropShape;
}

export interface LayoutOptions {
  paperWidthMm: number;
  paperHeightMm: number;
  marginMm: number;
  gapMm: number;
  packing?: "ordered" | "compact" | "optimized";
  /** Rotations are opt-in and allowed only for designs explicitly marked safe. */
  autoRotate?: boolean;
}

export interface Placement {
  itemId: string;
  copyIndex: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  /** The printed design is rotated clockwise by 90 degrees in the preview and PDF. */
  rotated?: boolean;
  /** Placement contour carried into manual collision detection and sheet reporting. */
  cropShape?: CropShape;
  /** Optional print-mode serial, rendered as a vector text overlay on this copy only. */
  serial?: { text: string; xPercent: number; yPercent: number; fontSizePt: number };
}

/**
 * User-defined millimeter positions are overlaid on the deterministic automatic
 * arrangement. Each override is bound to one item copy on one unchanged sheet.
 */
export interface ManualPlacement {
  itemId: string;
  copyIndex: number;
  pageIndex: number;
  xMm: number;
  yMm: number;
  rotated?: boolean;
}

export type TrimStyle = "outline" | "corner";
export interface TrimLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SheetPage {
  pageNumber?: number;
  placements: Placement[];
  cutLines?: TrimLine[];
  notepadCutLines?: TrimLine[];
}
