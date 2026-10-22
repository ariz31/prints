import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { PhotoAsset } from "../core/exportPdf.ts";
import { featherAlphaMask,paintAlphaBrush, removeConnectedBackground } from "../core/background.ts";
import type { RGB, BrushMode } from "../core/background.ts";
import {parseBoundedNumber} from "../core/safeNumbers.ts";

interface Props {
  item: PhotoAsset;
  onApply: (blob: Blob, width: number, height: number) => void;
  onReset: () => void;
  onClose: () => void;
}
const MAX_EDITOR_PIXELS = 1600;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode the source image."));
    image.src = src;
  });
}

export default function BackgroundEditor({ item, onApply, onReset, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<ImageData | null>(null);
  const editingRef = useRef<ImageData | null>(null);
  const dragging = useRef(false);
  const lastPosition = useRef<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<"sample" | BrushMode>("sample");
  const [tolerance, setTolerance] = useState(45);
  const [radius, setRadius] = useState(18);
  const [feather, setFeather] = useState(2);
  const [sample, setSample] = useState<RGB>([255, 255, 255]);
  const [status, setStatus] = useState("Loading image…");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    sourceRef.current = null;
    editingRef.current = null;
    void Promise.all([loadImage(item.url), loadImage(item.processedUrl ?? item.url)]).then(([original, effective]) => {
      if (cancelled) return;
      const scale = Math.min(1, MAX_EDITOR_PIXELS / original.naturalWidth,
        MAX_EDITOR_PIXELS / original.naturalHeight);
      canvas.width = Math.max(1, Math.round(original.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(original.naturalHeight * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("This device does not support canvas editing.");
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(original, 0, 0, canvas.width, canvas.height);
      sourceRef.current = context.getImageData(0, 0, canvas.width, canvas.height);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(effective, 0, 0, canvas.width, canvas.height);
      editingRef.current = context.getImageData(0, 0, canvas.width, canvas.height);
      const p = sourceRef.current.data;
      setSample([p[0], p[1], p[2]]);
      setStatus("Ready. Sample a backdrop color or use erase/restore brushes.");
    }).catch((cause: unknown) => {
      if (!cancelled) setStatus(cause instanceof Error ? cause.message : "Unable to edit the image.");
    });
    return () => { cancelled = true; };
  }, [item.url, item.processedUrl]);

  function draw() {
    if (!editingRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (context) context.putImageData(editingRef.current, 0, 0);
  }

  function getPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / bounds.width * canvas.width,
      y: (event.clientY - bounds.top) / bounds.height * canvas.height,
    };
  }

  function paint(current: { x: number; y: number }) {
    const image = editingRef.current;
    const original = sourceRef.current;
    if (!image || !original || mode === "sample") return;
    const from = lastPosition.current ?? current;
    const distance = Math.hypot(current.x - from.x, current.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * .35)));
    for (let i = 1; i <= steps; i++) {
      const x = from.x + (current.x - from.x) * i / steps;
      const y = from.y + (current.y - from.y) * i / steps;
      paintAlphaBrush(image.data, original.data, image.width, image.height, x, y, radius, mode);
    }
    lastPosition.current = current;
    draw();
  }

  function down(event: PointerEvent<HTMLCanvasElement>) {
    if (!editingRef.current || !sourceRef.current) return;
    const point = getPoint(event);
    if (mode === "sample") {
      const x = Math.max(0, Math.min(sourceRef.current.width - 1, Math.floor(point.x)));
      const y = Math.max(0, Math.min(sourceRef.current.height - 1, Math.floor(point.y)));
      const i = (y * sourceRef.current.width + x) * 4;
      const colors = sourceRef.current.data;
      setSample([colors[i], colors[i + 1], colors[i + 2]]);
      setStatus("Sampled the selected backdrop color.");
      return;
    }
    dragging.current = true;
    lastPosition.current = point;
    event.currentTarget.setPointerCapture(event.pointerId);
    paint(point);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (dragging.current) paint(getPoint(event));
  }
  function stop() {
    dragging.current = false;
    lastPosition.current = null;
  }

  function automaticRemoval() {
    const current = editingRef.current;
    if (!current) return;
    try {
      const result = removeConnectedBackground(
        current.data, current.width, current.height, sample, tolerance,
      );
      current.data.set(result.pixels);
      draw();
      setStatus("Removed " + result.removed.toLocaleString() +
        " connected background pixels. Inspect edges and manually refine.");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Background cleanup failed.");
    }
  }

  function softenEdges(){
    const current=editingRef.current;
    if(!current)return;
    try{
      const next=featherAlphaMask(current.data,current.width,current.height,feather);
      current.data.set(next);
      draw();
      setStatus("Feathered the cutout in premultiplied color space. Inspect hair and light edges before applying.");
    }catch(cause){
      setStatus(cause instanceof Error?cause.message:"Could not refine cutout edges.");
    }
  }

  function restoreOriginal() {
    const original = sourceRef.current;
    if (!original || !editingRef.current) return;
    editingRef.current.data.set(original.data);
    draw();
    setStatus("Editor restored to the original image. Apply or reset the saved result.");
  }

  async function apply() {
    const canvas = canvasRef.current;
    if (!canvas || !editingRef.current) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) =>
          value ? resolve(value) : reject(new Error("Could not encode the transparent PNG.")), "image/png");
      });
      onApply(blob, canvas.width, canvas.height);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Could not save edited background.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="background-editor" aria-label="Background cleanup editor">
    <div className="crop-toolbar">
      <div>
        <h2>Background cleanup</h2>
        <p>Local color-aware edge removal and manual brush refinement. The original remains unchanged.</p>
      </div>
      <button className="secondary-button" onClick={onClose}>Close</button>
    </div>
    <div className="background-controls">
      <label>Tool
        <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="sample">Sample background</option>
          <option value="erase">Erase mask brush</option>
          <option value="restore">Restore original brush</option>
        </select>
      </label>
      <label>Color tolerance: {tolerance}
        <input type="range" min="0" max="150" value={tolerance}
          onChange={e=>{const value=parseBoundedNumber(e.target.value,0,150,true);
            if(value!==null)setTolerance(value);
          }} />
      </label>
      <label>Brush radius: {radius} px
        <input type="range" min="2" max="100" value={radius}
          onChange={e=>{const value=parseBoundedNumber(e.target.value,2,100,true);
            if(value!==null)setRadius(value);
          }} />
      </label>
      <label>Edge softness: {feather} px
        <input type="range" min="0" max="6" value={feather}
          onChange={e=>{const value=parseBoundedNumber(e.target.value,0,6,true);
            if(value!==null)setFeather(value);
          }} />
      </label>
      <span className="sample-chip" title="Sampled backdrop color" style={{
        backgroundColor: "rgb(" + sample.join(",") + ")",
      }} />
    </div>
    <div className="background-actions">
      <button className="secondary-button" disabled={!editingRef.current}
        onClick={automaticRemoval}>Remove matching edge background</button>
      <button className="secondary-button" disabled={!editingRef.current || feather===0}
        onClick={softenEdges}>Feather cutout edges</button>
      <button className="secondary-button" onClick={restoreOriginal}>Restore original in editor</button>
    </div>
    <div className="background-stage">
      <canvas ref={canvasRef} aria-label="Edit background using mouse or touch"
        onPointerDown={down} onPointerMove={move} onPointerUp={stop}
        onPointerCancel={stop} />
    </div>
    <p className="hint" role="status">{status}</p>
    <p className="hint">This is a solid-color removal tool, not AI subject segmentation. Complex hair and textured backgrounds still need a dedicated AI model.</p>
    <div className="background-actions">
      <button className="secondary-button" onClick={() => { onReset(); onClose(); }}>
        Remove current processed version</button>
      <button className="primary-button" disabled={saving || !editingRef.current}
        onClick={() => void apply()}>{saving ? "Saving…" : "Apply edited background"}</button>
    </div>
  </section>;
}
