import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { PhotoAsset } from "../core/exportPdf.ts";
import { dragCrop, FULL_CROP } from "../core/crop.ts";
import type { CropRegion } from "../core/crop.ts";

interface Props {
  item: PhotoAsset;
  onUpdate: (crop: CropRegion) => void;
  onClose: () => void;
}

/** Pointer-based normalized crop selection: browser preview is not modified until confirmed. */
export default function CropEditor({ item, onUpdate, onClose }: Props) {
  const anchor = useRef<{ x: number; y: number } | null>(null);
  const [candidate, setCandidate] = useState<CropRegion>(item.crop);
  function position(event: PointerEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    anchor.current = position(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setCandidate(dragCrop(anchor.current, anchor.current));
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!anchor.current) return;
    setCandidate(dragCrop(anchor.current, position(event)));
  }
  function up(event: PointerEvent<HTMLDivElement>) {
    if (anchor.current) setCandidate(dragCrop(anchor.current, position(event)));
    anchor.current = null;
  }
  return <section className="crop-editor" aria-label="Interactive image crop editor">
    <div className="crop-toolbar">
      <div><h2>Crop source image</h2>
        <p>{item.name} · Drag a rectangle, then apply. Original image stays unchanged.</p></div>
      <button className="secondary-button" onClick={onClose}>Close</button>
    </div>
    <div className="crop-stage" style={{ aspectRatio: item.pixelWidth + "/" + item.pixelHeight }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { anchor.current = null; }}>
      <img src={item.url} draggable={false} alt={"Uncropped source " + item.name} />
      <div className="crop-boundary" style={{
        left: candidate.x * 100 + "%", top: candidate.y * 100 + "%",
        width: candidate.width * 100 + "%", height: candidate.height * 100 + "%",
      }} />
    </div>
    <div className="crop-actions">
      <span>Selection: {(candidate.width * 100).toFixed(1)}% × {(candidate.height * 100).toFixed(1)}%</span>
      <button className="secondary-button" onClick={() => setCandidate({ ...FULL_CROP })}>Select full image</button>
      <button className="primary-button" onClick={() => { onUpdate(candidate); onClose(); }}>Apply crop</button>
    </div>
  </section>;
}
