import { LineJoinStyle, popGraphicsState, pushGraphicsState, setLineJoin } from "pdf-lib";
import type { Color, PDFPage } from "pdf-lib";
import { createFrameGeometry } from "./frames.ts";
import { PDF_POINTS_PER_MM } from "./layout.ts";

interface FramePdfOptions {
  frameId: string;
  widthMm: number;
  heightMm: number;
  weight: number;
  inset?:number;
  spacing?:number;
  /** Upper-left corner in PDF points, with the PDF's bottom-left origin. */
  left: number;
  top: number;
  color: Color;
  opacity: number;
}

/** Draw vectors at print resolution, converting top-left geometry to PDF coordinates. */
export function drawFramePdf(page: PDFPage, options: FramePdfOptions): void {
  const { frameId, widthMm, heightMm, weight, inset, spacing, left, top, color, opacity } = options;
  const primitives = createFrameGeometry(frameId, widthMm, heightMm, weight, {inset,spacing});
  const pt = PDF_POINTS_PER_MM;
  page.pushOperators(pushGraphicsState(), setLineJoin(LineJoinStyle.Round));
  try {
    for (const primitive of primitives) {
      const borderWidth = primitive.strokeWidth * pt;
      switch (primitive.kind) {
        case "line":
          page.drawLine({
            start: { x: left + primitive.x1 * pt, y: top - primitive.y1 * pt },
            end: { x: left + primitive.x2 * pt, y: top - primitive.y2 * pt },
            thickness: borderWidth, color, opacity,
          });
          break;
        case "rect":
          page.drawRectangle({
            x: left + primitive.x * pt, y: top - (primitive.y + primitive.height) * pt,
            width: primitive.width * pt, height: primitive.height * pt,
            borderWidth, borderColor: color, borderOpacity: opacity,
            ...(primitive.fill ? { color, opacity } : {}),
          });
          break;
        case "ellipse":
          page.drawEllipse({
            x: left + primitive.cx * pt, y: top - primitive.cy * pt,
            xScale: primitive.rx * pt, yScale: primitive.ry * pt,
            borderWidth, borderColor: color, borderOpacity: opacity,
            ...(primitive.fill ? { color, opacity } : {}),
          });
          break;
        case "polyline":
        case "polygon": {
          // Explicit point conversion avoids scaling the line width twice.
          const path = primitive.points.map((point, index) =>
            `${index === 0 ? "M" : "L"} ${point.x * pt} ${point.y * pt}`).join(" ") +
            (primitive.kind === "polygon" ? " Z" : "");
          page.drawSvgPath(path, { x: left, y: top, borderWidth, borderColor: color,
            borderOpacity: opacity,
            ...(primitive.kind === "polygon" && primitive.fill ? { color, opacity } : {}),
          });
          break;
        }
      }
    }
  } finally {
    page.pushOperators(popGraphicsState());
  }
}
