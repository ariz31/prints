import { memo } from "react";
import { createFrameGeometry } from "../core/frames.ts";
import type { FramePrimitive } from "../core/frames.ts";

interface Props {
  frameId: string;
  widthMm: number;
  heightMm: number;
  weight: number;
  color: string;
}

/** The editor and sheet preview share the same millimeter geometry as export. */
function FrameSvg({ frameId, widthMm, heightMm, weight, color }: Props) {
  const primitives = createFrameGeometry(frameId, widthMm, heightMm, weight);
  const shape = (primitive: FramePrimitive, key: number) => {
    const stroke = { stroke: color, strokeWidth: primitive.strokeWidth };
    switch (primitive.kind) {
      case "line":
        return <line key={key} {...stroke} x1={primitive.x1} y1={primitive.y1}
          x2={primitive.x2} y2={primitive.y2} />;
      case "rect":
        return <rect key={key} {...stroke} x={primitive.x} y={primitive.y} width={primitive.width}
          height={primitive.height} fill={primitive.fill ? color : "none"} />;
      case "ellipse":
        return <ellipse key={key} {...stroke} cx={primitive.cx} cy={primitive.cy} rx={primitive.rx}
          ry={primitive.ry} fill={primitive.fill ? color : "none"} />;
      case "polyline":
        return <polyline key={key} {...stroke} points={primitive.points.map(point => `${point.x},${point.y}`).join(" ")}
          fill="none" />;
      case "polygon":
        return <polygon key={key} {...stroke} points={primitive.points.map(point => `${point.x},${point.y}`).join(" ")}
          fill={primitive.fill ? color : "none"} />;
    }
  };
  return <svg viewBox={`0 0 ${widthMm} ${heightMm}`} preserveAspectRatio="xMidYMid meet"
    aria-hidden="true" focusable="false" strokeLinecap="butt" strokeLinejoin="round"
    style={{ display: "block", width: "100%", height: "100%", pointerEvents: "none" }}>
    {primitives.map(shape)}
  </svg>;
}

export default memo(FrameSvg);
