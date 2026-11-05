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
  /** Optional stable edit group; has no effect on print geometry. */
  groupId?: string;
}

export interface TextLayer extends LayerBase {
  kind: "text";
  text: string;
  fontSizePt: number;
  fontFamily?: "Helvetica" | "TimesRoman" | "Courier";
  /** Stable ID of a locally bundled font, embedded into PDFs on export. */
  bundledFontId?: string;
  /** User-provided TTF/OTF, embedded per-project and subset in PDFs. */
  fontData?: string;
  fontName?: string;
  align?: "left" | "center" | "right";
  lineHeightFactor?: number;
  outlinePt?: number;
  outlineColor?: string;
  shadowPt?: number;
  shadowColor?: string;
}

export interface ShapeLayer extends LayerBase {
  kind: "rectangle" | "ellipse";
}

/** A decorative frame always covers the whole printable design. */
export interface FrameLayer extends LayerBase {
  kind: "frame";
  frameId: string;
  weight: number;
  inset?: number;
  spacing?: number;
}

export type DesignLayer = TextLayer | ShapeLayer | FrameLayer;

export const MAX_DESIGN_LAYERS = 100;
