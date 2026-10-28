import {useEffect,useRef,useState} from "react";
import type {CSSProperties,PointerEvent,KeyboardEvent} from "react";
import type {PhotoAsset} from "../core/exportPdf.ts";
import {fitCropToAspect,panCrop,zoomCrop,FULL_CROP} from "../core/crop.ts";
import type {CropRegion} from "../core/crop.ts";
import {photoFilterCss} from "../core/photoAdjustments.ts";
import {parseBoundedNumber} from "../core/safeNumbers.ts";
import {photoPreviewAsset,photoPreviewSource,photoSourceFailureMode} from "../core/photoSourceRecovery.ts";
import type {PhotoSourceMode} from "../core/photoSourceRecovery.ts";

import EditorWorkspace from "./EditorWorkspace.tsx";
import BoundedNumberField from "./BoundedNumberField.tsx";
import {useEditorHistory} from "./useEditorHistory.ts";
import {gestureCrop} from "../core/cropGesture.ts";

import {useCropRaster} from "./useCropRaster.ts";

interface Props{
 item:PhotoAsset;
 onUpdate:(value:CropRegion)=>void;
 onClose:()=>void;
 onRestoreOriginal?:()=>void;
}
/** A crop is committed only after its actual source has successfully loaded. */
export default function CropEditor({item,onUpdate,onClose,onRestoreOriginal}:Props){
 const iw=item.processedWidth??item.pixelWidth,ih=item.processedHeight??item.pixelHeight;
 const fit=()=>fitCropToAspect(item.crop,iw,ih,item.widthMm,item.heightMm);
 const history=useEditorHistory<CropRegion>(fit);
 const crop=history.value;
 const cropRef=useRef(crop);cropRef.current=crop;
 const pointers=useRef(new Map<number,{x:number;y:number}>());
 const stageRef=useRef<HTMLDivElement>(null);
 const [showGrid,setGrid]=useState(true);
 const [retry,setRetry]=useState(0);
 const [loadedKey,setLoadedKey]=useState("");
 const [error,setError]=useState("");
 const [failure,setFailure]=useState<{identity:string;mode:PhotoSourceMode}|null>(null);
 const sourceIdentity=JSON.stringify([item.url,item.processedUrl??null]);
 const cropIdentity=JSON.stringify([sourceIdentity,item.crop,item.pixelWidth,item.pixelHeight,
   item.processedWidth,item.processedHeight,item.widthMm,item.heightMm]);
 const mode=failure?.identity===sourceIdentity?failure.mode:"primary";
 const unavailable=mode==="unavailable";
 const fallback=mode==="original";
 const displayAsset=photoPreviewAsset(item,mode);
 const source=photoPreviewSource(item,mode);
 const imageKey=(source??"unavailable")+":"+retry+":"+sourceIdentity;
 const ready=!!source&&loadedKey===imageKey;
 const interactive=ready&&mode==="primary";
 const raster=useCropRaster({...displayAsset,crop:fallback?displayAsset.crop:crop},ready,retry);
 const canApply=interactive&&raster.ready;
 const frameRatio=item.widthMm/item.heightMm;
 const displayCrop=fallback?displayAsset.crop:crop;
 const base=fitCropToAspect(FULL_CROP,
   displayAsset.processedWidth??displayAsset.pixelWidth,
   displayAsset.processedHeight??displayAsset.pixelHeight,item.widthMm,item.heightMm);
 const zoom=Math.round(base.width/displayCrop.width*100)/100;
 const commit=(next:CropRegion,key="gesture")=>{cropRef.current=next;history.change(next,key);};
 useEffect(()=>{
   // Changing the processed image can alter its aspect ratio and crop center.
   const next=fit();cropRef.current=next;history.reset(next);
   setLoadedKey("");setFailure(null);setError("");setRetry(0);
   pointers.current.clear();
 // This signature represents externally committed geometry, not local dragging.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[cropIdentity]);
 const move=(e:PointerEvent<HTMLDivElement>)=>{
   if(!interactive||!pointers.current.has(e.pointerId))return;
   const before=[...pointers.current.values()];
   pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
   commit(gestureCrop(cropRef.current,before,[...pointers.current.values()],e.currentTarget.getBoundingClientRect()));
 };
 const down=(e:PointerEvent<HTMLDivElement>)=>{
   if(!interactive||pointers.current.size>=2||(e.pointerType==="mouse"&&e.button!==0))return;
   try {e.currentTarget.setPointerCapture(e.pointerId);}catch{return;}
   pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
 };
 const up=(e:PointerEvent<HTMLDivElement>)=>{pointers.current.delete(e.pointerId);};
 useEffect(()=>{
   const el=stageRef.current;
   if(!el||!interactive)return;
   const handle=(e:WheelEvent)=>{
     if(e.ctrlKey||e.metaKey)return;
     e.preventDefault();
     const rect=el.getBoundingClientRect();
     if(!rect.width||!rect.height)return;
     if(!Number.isFinite(e.deltaY))return;
     const x=(e.clientX-rect.left)/rect.width,y=(e.clientY-rect.top)/rect.height;
     const factor=Math.exp(Math.max(-2,Math.min(2,-e.deltaY/460)));
     commit(zoomCrop(cropRef.current,factor,x,y));
   };
   el.addEventListener("wheel",handle,{passive:false});
   return()=>el.removeEventListener("wheel",handle);
 },[interactive]);
 const key=(e:KeyboardEvent<HTMLDivElement>)=>{
   if(!interactive)return;
   const moves:Record<string,[number,number]>={
     ArrowUp:[0,-.025],ArrowDown:[0,.025],ArrowLeft:[-.025,0],ArrowRight:[.025,0]
   };
   if(moves[e.key]){
     e.preventDefault();const [dx,dy]=moves[e.key];commit(panCrop(cropRef.current,dx,dy));
   }else if(e.key==="+"||e.key==="="){
     e.preventDefault();commit(zoomCrop(cropRef.current,1.12));
   }else if(e.key==="-"){
     e.preventDefault();commit(zoomCrop(cropRef.current,1/1.12));
   }
 };
 const setZoom=(value:number)=>{
   if(!interactive||!Number.isFinite(value)||value<1||value>8)return;
   commit(zoomCrop(cropRef.current,value/(base.width/cropRef.current.width)));
 };
 const imageFailed=()=>{
   if(!source)return;
   setLoadedKey("");
   const next=photoSourceFailureMode(item,source,mode);
   setFailure({identity:sourceIdentity,mode:next});
   pointers.current.clear();
   setError(next==="original"
     ?"The processed photo could not be opened. Only the original can be previewed. Restore it to repair this design."
     :"The photo is unavailable. Retry, reopen a saved project, or reimport the source image.");
 };
 const retryImage=()=>{
   setFailure(null);setLoadedKey("");setError("");setRetry(value=>value+1);
 };
 const stage=<div ref={stageRef} className="crop-view" style={{aspectRatio:String(frameRatio),"--crop-ratio":frameRatio} as CSSProperties} role="group"
     tabIndex={0} aria-label="Drag to move photo; pinch, scroll or use the slider to zoom"
     onPointerDown={down} onPointerMove={move} onPointerUp={up}
     onPointerCancel={up} onLostPointerCapture={up} onKeyDown={key}>
     {source&&<img key={imageKey} src={source} alt={item.name} draggable={false}
       onLoad={()=>setLoadedKey(imageKey)} onError={imageFailed}
       style={{visibility:raster.url?"hidden":undefined,filter:photoFilterCss(item.adjustments),width:(100/displayCrop.width)+"%",
         height:(100/displayCrop.height)+"%",left:(-100*displayCrop.x/displayCrop.width)+"%",
         top:(-100*displayCrop.y/displayCrop.height)+"%"}}/>}
     {raster.url&&<img key={raster.url} src={raster.url} alt="Exact computed print crop" onLoad={event=>raster.loaded(event.currentTarget.src)} onError={raster.failed}
       style={{inset:0,width:"100%",height:"100%"}}/>}
     {(!ready||!raster.ready)&&!unavailable&&<span className="crop-loading" role="status">{ready?"Updating crop…":"Loading photo…"}</span>}
     {showGrid&&<div className="crop-grid" aria-hidden="true"/>}
     <span className="crop-frame-corner top-left"/><span className="crop-frame-corner top-right"/>
     <span className="crop-frame-corner bottom-left"/><span className="crop-frame-corner bottom-right"/>
   </div>;
 return <EditorWorkspace title="Crop & frame" name={item.name} className="crop-workspace"
   onCancel={onClose} onApply={()=>{if(canApply){onUpdate(cropRef.current);onClose();}}}
   applyLabel="Apply crop" disabled={!canApply} stage={stage}
   undo={()=>{history.undo();pointers.current.clear();}}
   redo={()=>{history.redo();pointers.current.clear();}}
   canUndo={history.canUndo} canRedo={history.canRedo}
   tools={<span className="crop-output">{item.widthMm} × {item.heightMm} mm · {Math.round(zoom*100)}%</span>}>
   <h2>Framing</h2><p className="hint">Move the photo inside the fixed print window. Pinch to zoom; arrow keys for precise movement.</p>
   {(!!error||!!raster.error||unavailable)&&<div className="crop-source-warning" role="alert">
     <p>{error||raster.error||"The photo source cannot be displayed."}</p>
     <button className="secondary-button" type="button" onClick={retryImage}>Retry photo</button>
     {fallback&&ready&&onRestoreOriginal&&<button className="secondary-button" type="button"
       onClick={onRestoreOriginal}>Restore original for this design</button>}
   </div>}
   <div className="crop-zoom">
     <button className="icon-button" aria-label="Zoom out" disabled={!interactive}
       onClick={()=>setZoom(Math.max(1,zoom/1.25))}>−</button>
     <label>Zoom <input type="range" min="1" max="8" step=".01" value={Math.min(8,zoom)}
       disabled={!interactive} onChange={e=>{
         const value=parseBoundedNumber(e.target.value,1,8);
         if(value!==null)setZoom(value);
       }}/></label>
     <button className="icon-button" aria-label="Zoom in" disabled={!interactive}
       onClick={()=>setZoom(Math.min(8,zoom*1.25))}>+</button>
     <span className="crop-zoom-value">{Math.round(zoom*100)}%</span>
   </div>
   <div className="crop-actions">
     <label className="check-row"><input type="checkbox" checked={showGrid}
       onChange={e=>setGrid(e.target.checked)}/>Grid</label>
     <button className="secondary-button" disabled={!interactive} onClick={()=>commit(fit(),"reset")}>Reset</button>
     <button className="secondary-button" disabled={!interactive} onClick={()=>commit(fitCropToAspect(FULL_CROP,iw,ih,item.widthMm,item.heightMm),"fit")}>Fit</button>
   </div>
   <div className="two-inputs">
    <BoundedNumberField label="Source X (%)" value={Math.round(crop.x*10000)/100} min={0} max={Math.round((1-crop.width)*10000)/100} step={.01}
     onCommit={value=>{if(canApply)commit({...crop,x:Math.min(1-crop.width,value/100)},"position-x");}}/>
    <BoundedNumberField label="Source Y (%)" value={Math.round(crop.y*10000)/100} min={0} max={Math.round((1-crop.height)*10000)/100} step={.01}
     onCommit={value=>{if(canApply)commit({...crop,y:Math.min(1-crop.height,value/100)},"position-y");}}/>
   </div>
 </EditorWorkspace>;
}
