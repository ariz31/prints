import { useEffect, useRef, useState } from "react";
import {WorkspaceEpoch} from "../core/workspaceEpoch.ts";
import type { PointerEvent } from "react";
import type { PhotoAsset } from "../core/exportPdf.ts";
import { featherAlphaMask,paintAlphaBrush, removeConnectedBackground } from "../core/background.ts";
import type { RGB, BrushMode } from "../core/background.ts";
import {parseBoundedNumber} from "../core/safeNumbers.ts";
import {applyPersonMask,segmentPersonLocally,SEGMENTATION_MODEL_NOTICE} from "../core/segmentationModel.ts";
import type {ForegroundMask} from "../core/segmentationModel.ts";
import {backgroundImageRect,backgroundPositionPercent} from "../core/backgroundPlacement.ts";
import type {BackdropFit} from "../core/backgroundPlacement.ts";

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
  const activePointer = useRef<number|null>(null);
  const lastPosition = useRef<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<"sample" | BrushMode>("sample");
  const [tolerance, setTolerance] = useState(45);
  const [radius, setRadius] = useState(18);
  const [feather, setFeather] = useState(2);
  const [sample, setSample] = useState<RGB>([255, 255, 255]);
  const [status, setStatus] = useState("Loading image…");
  const [saving, setSaving] = useState(false);
  const [aiBusy,setAiBusy]=useState(false);
  const [aiConsent,setAiConsent]=useState(false);
  const [aiThreshold,setAiThreshold]=useState(50);
  const [aiSoftness,setAiSoftness]=useState(15);
  const [backgroundColor,setBackgroundColor]=useState("transparent");
  const [backdropUrl,setBackdropUrl]=useState<string|null>(null);
  const backdropUrlRef=useRef<string|null>(null);
  const [backdropFit,setBackdropFit]=useState<BackdropFit>("cover");
  const [backdropOffsetX,setBackdropOffsetX]=useState(0);
  const [backdropOffsetY,setBackdropOffsetY]=useState(0);
  const aiController=useRef<AbortController|null>(null);
  const aiResult=useRef<{mask:ForegroundMask;base:Uint8ClampedArray}|null>(null);
  const savingRef=useRef(false);
  const saveEpoch=useRef(new WorkspaceEpoch());
  const active=useRef(false);
  useEffect(()=>{
    active.current=true;
    return()=>{active.current=false;saveEpoch.current.advance();aiController.current?.abort();
      if(backdropUrlRef.current)URL.revokeObjectURL(backdropUrlRef.current);};
  },[]);
  function closeEditor(){saveEpoch.current.advance();aiController.current?.abort();onClose();}

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    sourceRef.current = null;
    editingRef.current = null;
    aiResult.current=null;
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
    if(activePointer.current!==null)return;
    activePointer.current=event.pointerId;
    dragging.current = true;
    lastPosition.current = point;
    event.currentTarget.setPointerCapture(event.pointerId);
    paint(point);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (dragging.current && activePointer.current===event.pointerId) paint(getPoint(event));
  }
  function stop(event: PointerEvent<HTMLCanvasElement>) {
    if(activePointer.current!==event.pointerId)return;
    activePointer.current=null;
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

  function reapplyAIMask(threshold=aiThreshold,softness=aiSoftness){
    const previous=aiResult.current,current=editingRef.current;
    if(!previous||!current)return;
    try{
      current.data.set(applyPersonMask(previous.base,current.width,current.height,
        previous.mask,threshold/100,softness/100));
      draw();
      setStatus("Model mask reapplied. Use Erase/Restore brushes and edge feathering to refine details.");
    }catch(cause){setStatus(cause instanceof Error?cause.message:"Could not apply AI mask.");}
  }
  async function removeAIBg(){
    const frame=editingRef.current;
    if(!frame||!aiConsent||aiBusy)return;
    const controller=new AbortController();
    aiController.current=controller;
    const generation=saveEpoch.current.capture();
    setAiBusy(true);
    try{
      // Snapshot the current pixels; never alter the editor until inference succeeds.
      const base=new Uint8ClampedArray(frame.data);
      const picture=new ImageData(new Uint8ClampedArray(base),frame.width,frame.height);
      const mask=await segmentPersonLocally(picture,controller.signal,setStatus);
      if(!active.current||!saveEpoch.current.current(generation)||controller.signal.aborted)return;
      aiResult.current={base,mask};
      reapplyAIMask(aiThreshold,aiSoftness);
      // Ref above is now set, apply immediately for first-run state.
      frame.data.set(applyPersonMask(base,frame.width,frame.height,mask,
       aiThreshold/100,aiSoftness/100));
      draw();
      setStatus("AI foreground segmented locally. Inspect hair/glasses and refine with brushes before applying.");
    }catch(cause){
      if(!controller.signal.aborted&&active.current)
        setStatus("AI unavailable: "+(cause instanceof Error?cause.message:"Model inference failed.")+
          " Manual background cleanup remains available.");
    }finally{
      if(active.current)setAiBusy(false);
      if(aiController.current===controller)aiController.current=null;
    }
  }
  function selectLocalBackdrop(file:File|undefined){
    if(!file)return;
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)||
       file.size<1||file.size>10*1024*1024){
      setStatus("Select a PNG/JPEG/WebP backdrop no larger than 10 MiB.");return;
    }
    const url=URL.createObjectURL(file);
    if(backdropUrlRef.current)URL.revokeObjectURL(backdropUrlRef.current);
    backdropUrlRef.current=url;setBackdropUrl(url);setBackgroundColor("local");
    setBackdropOffsetX(0);setBackdropOffsetY(0);
    setStatus("Local backdrop selected. Review fit and position before applying.");
  }
  function restoreOriginal() {
    const original = sourceRef.current;
    if (!original || !editingRef.current) return;
    editingRef.current.data.set(original.data);
    aiResult.current=null;
    draw();
    setStatus("Editor restored to the original image. Apply or reset the saved result.");
  }

  async function apply() {
    const canvas = canvasRef.current;
    if (!canvas || !editingRef.current || savingRef.current) return;
    const generation=saveEpoch.current.capture();
    const width=canvas.width,height=canvas.height;
    savingRef.current=true;
    setSaving(true);
    try {
      // Composite only during the final encode, leaving the editable alpha mask
      // transparent so subsequent manual restore/edge refinement stays reversible.
      const output=document.createElement("canvas");
      try {
      output.width=width;output.height=height;
      const ctx=output.getContext("2d");
      if(!ctx)throw new Error("Unable to encode this photo.");
      if(backgroundColor==="local"){
        const url=backdropUrlRef.current;
        if(!url)throw new Error("Choose a local background image first.");
        const image=await loadImage(url);
        if(!active.current||!saveEpoch.current.current(generation))return;
        if(image.naturalWidth>6000||image.naturalHeight>6000||
          image.naturalWidth*image.naturalHeight>16_000_000)
          throw new Error("Background image is too large for safe editing. Use a smaller photo.");
        const region=backgroundImageRect(image.naturalWidth,image.naturalHeight,
          width,height,backdropFit,backdropOffsetX,backdropOffsetY);
        ctx.drawImage(image,region.x,region.y,region.width,region.height);
      }else if(backgroundColor!=="transparent"){
        ctx.fillStyle=backgroundColor;ctx.fillRect(0,0,width,height);
      }
      ctx.drawImage(canvas,0,0);
      const blob = await new Promise<Blob>((resolve, reject) => {
        output.toBlob((value) =>
          value ? resolve(value) : reject(new Error("Could not encode the transparent PNG.")), "image/png");
      });
      // Closing, switching projects, or navigating Back invalidates in-flight
      // encoding. Canceled edits must never be committed after the fact.
      if(!active.current||!saveEpoch.current.current(generation))return;
      onApply(blob,width,height);
      } finally {output.width=0;output.height=0;}
    } catch (cause) {
      if(active.current&&saveEpoch.current.current(generation))
        setStatus(cause instanceof Error ? cause.message : "Could not save edited background.");
    } finally {
      savingRef.current=false;
      if(active.current)setSaving(false);
    }
  }

  return <section className="background-editor" aria-label="Background cleanup editor">
    <div className="crop-toolbar">
      <div>
        <h2>Background cleanup</h2>
        <p>Local color-aware edge removal and manual brush refinement. The original remains unchanged.</p>
      </div>
      <button className="secondary-button" onClick={closeEditor}>Close</button>
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
      <label className="check-row" title={SEGMENTATION_MODEL_NOTICE}>
        <input type="checkbox" checked={aiConsent} onChange={event=>setAiConsent(event.target.checked)}/>
        Allow optional AI model download and provider metrics
      </label>
      <button className="secondary-button" disabled={aiBusy||saving||!aiConsent||!editingRef.current}
        onClick={()=>void removeAIBg()}>{aiBusy?"Running local AI…":"Remove person background (AI)"}</button>
      {aiBusy&&<button className="secondary-button"
        onClick={()=>{aiController.current?.abort();setStatus("AI operation canceled.");}}>Cancel AI</button>}
      <label>AI cutout threshold: {aiThreshold}%
        <input type="range" min="10" max="90" value={aiThreshold}
          onChange={event=>setAiThreshold(Number(event.target.value))}/>
      </label>
      <label>AI edge softness: {aiSoftness}%
        <input type="range" min="1" max="50" value={aiSoftness}
          onChange={event=>setAiSoftness(Number(event.target.value))}/>
      </label>
      {aiResult.current&&<button className="secondary-button" onClick={()=>reapplyAIMask()}>
        Reapply AI threshold (resets later brush edits)</button>}
      <label>Finished background
        <select value={backgroundColor} onChange={event=>setBackgroundColor(event.target.value)}>
          <option value="transparent">Transparent</option>
          <option value="#ffffff">White</option>
          <option value="#0066cc">Blue</option>
          <option value="#e8e8e8">Light grey</option>
          {backdropUrl&&<option value="local">Local image</option>}
        </select>
      </label>
      <label>Custom background image (processed locally)
        <input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
          onChange={event=>selectLocalBackdrop(event.target.files?.[0])}/>
      </label>
      {backgroundColor==="local"&&backdropUrl&&<>
        <label>Image fit
          <select value={backdropFit} onChange={event=>setBackdropFit(event.target.value as BackdropFit)}>
            <option value="cover">Cover — fill the photo</option>
            <option value="contain">Contain — show whole background image</option>
          </select>
        </label>
        <label>Background horizontal position
          <input type="range" min="-100" max="100" value={backdropOffsetX*100}
            onChange={event=>setBackdropOffsetX(Number(event.target.value)/100)}/>
        </label>
        <label>Background vertical position
          <input type="range" min="-100" max="100" value={backdropOffsetY*100}
            onChange={event=>setBackdropOffsetY(Number(event.target.value)/100)}/>
        </label>
      </>}
      <button className="secondary-button" disabled={!editingRef.current}
        onClick={automaticRemoval}>Remove matching edge background</button>
      <button className="secondary-button" disabled={!editingRef.current || feather===0}
        onClick={softenEdges}>Feather cutout edges</button>
      <button className="secondary-button" onClick={restoreOriginal}>Restore original in editor</button>
    </div>
    <div className="background-stage">
      <canvas ref={canvasRef} aria-label="Edit background using mouse or touch"
        style={{backgroundColor:backgroundColor==="transparent"||backgroundColor==="local"?"transparent":backgroundColor,
          backgroundImage:backgroundColor==="local"&&backdropUrl?"url("+backdropUrl+")":undefined,
          backgroundSize:backgroundColor==="local"?backdropFit:undefined,
          backgroundPosition:backgroundColor==="local"
            ?backgroundPositionPercent(backdropOffsetX)+"% "+backgroundPositionPercent(backdropOffsetY)+"%":undefined,
          backgroundRepeat:"no-repeat"}}
        onPointerDown={down} onPointerMove={move} onPointerUp={stop}
        onPointerCancel={stop} onLostPointerCapture={stop} />
    </div>
    <p className="hint" role="status">{status}</p>
    <p className="hint">{SEGMENTATION_MODEL_NOTICE} Portrait segmentation is an approximate model result, not guaranteed accurate around fine hair, transparent objects, or complex edges. Refine manually and inspect the printed result.</p>
    <div className="background-actions">
      <button className="secondary-button" onClick={() => { saveEpoch.current.advance(); onReset(); onClose(); }}>
        Remove current processed version</button>
      <button className="primary-button" disabled={saving || !editingRef.current}
        onClick={() => void apply()}>{saving ? "Saving…" : "Apply edited background"}</button>
    </div>
  </section>;
}
