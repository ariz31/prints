import { createFrameGeometry } from "./frames.ts";

interface FrameCanvasOptions {
  frameId: string;
  widthMm: number;
  heightMm: number;
  weight: number;
  /** Pixel rectangle in the caller's current coordinate system. */
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

/** Draw to a complete canvas or a translated high-resolution output tile. */
export function drawFrameCanvas(ctx: CanvasRenderingContext2D, options: FrameCanvasOptions): void {
  const { frameId, widthMm, heightMm, weight, x, y, width, height, color } = options;
  const primitives = createFrameGeometry(frameId, widthMm, heightMm, weight);
  ctx.save();
  try {
    ctx.translate(x, y);
    ctx.scale(width / widthMm, height / heightMm);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    for (const primitive of primitives) {
      ctx.beginPath();
      ctx.lineWidth = primitive.strokeWidth;
      switch (primitive.kind) {
        case "line":
          ctx.moveTo(primitive.x1, primitive.y1);
          ctx.lineTo(primitive.x2, primitive.y2);
          break;
        case "rect":
          ctx.rect(primitive.x, primitive.y, primitive.width, primitive.height);
          break;
        case "ellipse":
          ctx.ellipse(primitive.cx, primitive.cy, primitive.rx, primitive.ry, 0, 0, Math.PI * 2);
          break;
        case "polyline":
        case "polygon":
          primitive.points.forEach((point, index) => {
            if (index === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
          });
          if (primitive.kind === "polygon") ctx.closePath();
          break;
      }
      if ((primitive.kind === "rect" || primitive.kind === "ellipse" || primitive.kind === "polygon") && primitive.fill)
        ctx.fill();
      ctx.stroke();
    }
  } finally {
    ctx.restore();
  }
}
