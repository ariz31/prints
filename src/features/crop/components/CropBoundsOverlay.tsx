import { useRef } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import type { CropRegion } from "../../../domain/models/crop.ts";
import { resizeCropRegion, type ResizeHandle } from "../logic/studioGeometry.ts";

interface Props {
  crop: CropRegion;
  /** Ratio in normalized source coordinates: print W / H × image H / W. */
  sourceRatio: number;
  onResize: (next: CropRegion, historyKey: string) => void;
  disabled?: boolean;
}
const HANDLES: readonly { id: ResizeHandle; x: number; y: number; label: string }[] = [
  { id: "nw", x: 0, y: 0, label: "Top-left" },
  { id: "n", x: 50, y: 0, label: "Top" },
  { id: "ne", x: 100, y: 0, label: "Top-right" },
  { id: "e", x: 100, y: 50, label: "Right" },
  { id: "se", x: 100, y: 100, label: "Bottom-right" },
  { id: "s", x: 50, y: 100, label: "Bottom" },
  { id: "sw", x: 0, y: 100, label: "Bottom-left" },
  { id: "w", x: 0, y: 50, label: "Left" },
] as const;
const CURSORS: Record<ResizeHandle, string> = {
  n: "ns-resize", ne: "nesw-resize", e: "ew-resize",
  se: "nwse-resize", s: "ns-resize", sw: "nesw-resize",
  w: "ew-resize", nw: "nwse-resize",
};
interface Gesture {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  crop: CropRegion;
}
/**
 * Eight fixed output-frame handles change the *one* normalized source crop.
 * The physical print frame remains stable; lock to its source-adjusted ratio
 * until the output dimension editor is wired to independent resize.
 */
export default function CropBoundsOverlay({ crop, sourceRatio, onResize, disabled }: Props) {
  const current = useRef<Gesture | null>(null);
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    const stage = e.currentTarget.closest(".crop-view");
    const rect = stage?.getBoundingClientRect();
    if (!rect || rect.width < 1 || rect.height < 1 || current.current) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { return; }
    current.current = { id: e.pointerId, x: e.clientX, y: e.clientY,
      width: rect.width, height: rect.height, crop };
    e.preventDefault();
  };
  const move = (handle: ResizeHandle, e: PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const start = current.current;
    if (!start || start.id !== e.pointerId || disabled) return;
    e.preventDefault();
    const dx = (e.clientX - start.x) / start.width * start.crop.width;
    const dy = (e.clientY - start.y) / start.height * start.crop.height;
    const next = resizeCropRegion(start.crop, handle, dx, dy, { ratio: sourceRatio });
    onResize(next, "crop-resize");
  };
  const stop = (e: PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (current.current?.id === e.pointerId) current.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };
  const key = (handle: ResizeHandle, e: KeyboardEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (disabled) return;
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const direction = directions[e.key];
    if (!direction) return;
    e.preventDefault();
    const step = (e.shiftKey ? .05 : .005);
    onResize(resizeCropRegion(crop, handle,
      direction[0] * crop.width * step,
      direction[1] * crop.height * step,
      { ratio: sourceRatio }), "crop-resize-keyboard");
  };
  return <div aria-label="Resize source crop" role="group"
    style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5 }}>
    {HANDLES.map(({ id, x, y, label }) => {
      const style: CSSProperties = {
        position: "absolute",
        left: x === 100 ? undefined : x+"%",
        right: x === 100 ? 0 : undefined,
        top: y === 100 ? undefined : y+"%",
        bottom: y === 100 ? 0 : undefined,
        transform: "translate("+(x===50?"-50%":"0")+","+(y===50?"-50%":"0")+")",
        width: "var(--crop-handle-size, 28px)",
        height: "var(--crop-handle-size, 28px)",
        minWidth: "var(--crop-handle-size, 28px)",
        minHeight: "var(--crop-handle-size, 28px)",
        borderRadius: 7,
        border: "2px solid var(--accent, #2578e5)",
        background: "var(--surface, #ffffff)", color: "var(--text, #18253b)",
        boxShadow: "0 1px 5px #0006", pointerEvents: "auto",
        touchAction: "none", cursor: CURSORS[id], padding: 0,
        opacity: disabled ? .4 : 1,
      };
      return <button type="button" key={id}
        aria-label={label + " crop resize handle. Use arrow keys for precise adjustment."}
        title={label + " resize"}
        disabled={disabled} style={style}
        onPointerDown={down} onPointerMove={e => move(id, e)}
        onPointerUp={stop} onPointerCancel={stop}
        onLostPointerCapture={() => { current.current = null; }}
        onKeyDown={e => key(id, e)} />;
    })}
  </div>;
}
