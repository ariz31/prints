import {useEffect,useRef,useState} from "react";
import type {CSSProperties,PointerEvent,KeyboardEvent} from "react";
import type {PhotoAsset} from "../../../core/exportPdf.ts";
import {fitCropToAspect,panCrop,zoomCrop,FULL_CROP} from "../../../core/crop.ts";
import type {CropRegion} from "../../../core/crop.ts";
import {liveCropImageStyle} from "../../../core/liveCropPreview.ts";
import {photoPreviewAsset,photoPreviewSource,photoSourceFailureMode} from "../../../core/photoSourceRecovery.ts";
import type {PhotoSourceMode} from "../../../core/photoSourceRecovery.ts";

import EditorWorkspace from "../../../components/EditorWorkspace.tsx";
import PhotoAdjustmentRow from "../../../components/PhotoAdjustmentRow.tsx";
import BoundedNumberField from "../../../components/BoundedNumberField.tsx";
import {useEditorHistory} from "../../../components/useEditorHistory.ts";
import {gestureCrop} from "../../../core/cropGesture.ts";

import {useCropRaster} from "../../../components/useCropRaster.ts";
import {CROP_SHAPES,cropShapePoints,shapeClipPath} from "../../../core/cropShapes.ts";
import type {CropShape} from "../../../core/cropShapes.ts";
import StudioSelect from "../../../components/StudioSelect.tsx";

interface Props{
 item:PhotoAsset;
 onUpdate:(value:{crop:CropRegion;cropShape:CropShape})=>void;
 onClose:()=>void;
 onRestoreOriginal?:()=>void;
}
/** A crop is committed only after its actual source has successfully loaded. */
export default function CropEditor({item,onUpdate,onClose,onRestoreOriginal}:Props){
 const iw=item.processedWidth??item.pixelWidth,ih=item.processedHeight??item.pixelHeight;
 const fit=()=>fitCropToAspect(item.crop,iw,ih,item.widthMm,item.heightMm);
 const history=useEditorHistory<{region:CropRegion;shape:CropShape}>(()=>({
   region:fit(),shape:item.cropShape??"rectangle",
 }));
 const crop=history.value.region;
 const cropRef=useRef(crop);cropRef.current=crop;
 const pointers=useRef(new Map<number,{x:number;y:number}>());
 const stageRef=useRef<HTMLDivElement>(null);
 const [showGrid,setGrid]=useState(true);
 const cropShape=history.value.shape;
 const setCropShape=(next:CropShape)=>history.change({...history.value,shape:next},"shape");
 const layered=(item.layers??[]).some(layer=>layer.visible);
 const invalidLayerShape=layered&&cropShape!=="rectangle";
 const [retry,setRetry]=useState(0);
 const [loadedKey,setLoadedKey]=useState("");
 const [error,setError]=useState("");
 const [failure,setFailure]=useState<{identity:string;mode:PhotoSourceMode}|null>(null);
 const sourceIdentity=JSON.stringify([item.url,item.processedUrl??null]);
 const cropIdentity=JSON.stringify([sourceIdentity,item.crop,item.pixelWidth,item.pixelHeight,
   item.processedWidth,item.processedHeight,item.widthMm,item.heightMm,item.cropShape]);
 const mode=failure?.identity===sourceIdentity?failure.mode:"primary";
 const unavailable=mode==="unavailable";
 const fallback=mode==="original";
 const displayAsset=photoPreviewAsset(item,mode);
 const source=photoPreviewSource(item,mode);
 const imageKey=(source??"unavailable")+":"+retry+":"+sourceIdentity;
 const ready=!!source&&loadedKey===imageKey;
 const interactive=ready&&mode==="primary";
 const raster=useCropRaster({...displayAsset,crop:fallback?displayAsset.crop:crop,cropShape},ready,retry);
 const canApply=interactive&&raster.ready&&!invalidLayerShape;
 const frameRatio=item.widthMm/item.heightMm;
 const displayCrop=fallback?displayAsset.crop:crop;
 const base=fitCropToAspect(FULL_CROP,
   displayAsset.processedWidth??displayAsset.pixelWidth,
   displayAsset.processedHeight??displayAsset.pixelHeight,item.widthMm,item.heightMm);
 const zoom=Math.round(base.width/displayCrop.width*100)/100;
 const commit=(next:CropRegion,key="gesture")=>{
   cropRef.current=next;history.change({...history.value,region:next},key);
 };
 useEffect(()=>{
   // Changing the processed image can alter its aspect ratio and crop center.
   const next=fit();cropRef.current=next;
   history.reset({region:next,shape:item.cropShape??"rectangle"});
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
     <div className="crop-mask-window" style={{position:"absolute",inset:0,overflow:"hidden",
       pointerEvents:"none",clipPath:shapeClipPath(cropShape)}}>
     {source&&<img key={imageKey} src={source} alt={item.name} draggable={false}
       onLoad={()=>setLoadedKey(imageKey)} onError={imageFailed}
       style={{...liveCropImageStyle(displayCrop,item.adjustments),visibility:raster.ready?"hidden":undefined}}/>}
     {raster.url&&<img key={raster.url} src={raster.url} alt="Exact computed print crop" onLoad={event=>raster.loaded(event.currentTarget.src)} onError={raster.failed}
       style={{inset:0,width:"100%",height:"100%",visibility:raster.ready?undefined:"hidden"}}/>}
     {showGrid&&<div className="crop-grid" aria-hidden="true"/>}
     </div>
     {cropShape!=="rectangle"&&<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
       style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:3}}>
       <polygon points={cropShapePoints(cropShape).map(p=>(p.x*100)+","+(p.y*100)).join(" ")}
         fill="none" stroke="white" strokeWidth=".45" strokeDasharray="1.5 .9"/>
     </svg>}
     {!ready&&!unavailable&&<span className="crop-loading" role="status">Loading photo…</span>}
     {cropShape==="rectangle"&&<>
       <span className="crop-frame-corner top-left"/><span className="crop-frame-corner top-right"/>
       <span className="crop-frame-corner bottom-left"/><span className="crop-frame-corner bottom-right"/>
     </>}
   </div>;
 return <EditorWorkspace title="Crop & frame" name={item.name} className="crop-workspace"
   onCancel={onClose} onApply={()=>{if(canApply){onUpdate({crop:cropRef.current,cropShape});onClose();}}}
   applyLabel="Apply crop" disabled={!canApply} stage={stage}
   undo={()=>{if(interactive){history.undo();pointers.current.clear();}}}
   redo={()=>{if(interactive){history.redo();pointers.current.clear();}}}
   canUndo={history.canUndo&&interactive} canRedo={history.canRedo&&interactive}
   tools={<span className="crop-output">{item.widthMm} × {item.heightMm} mm · {Math.round(zoom*100)}%</span>}>
   <h2>Framing</h2><p className="hint">Move the photo inside the fixed print window. Pinch to zoom; arrow keys for precise movement.</p>
   <label className="print-field"><span className="field-label">Crop shape · 15 presets</span>
     <StudioSelect aria-label="Crop shape" value={cropShape}
       onChange={event=>setCropShape(event.target.value as CropShape)}>
       {CROP_SHAPES.map(shape=><option key={shape.id} value={shape.id}>{shape.label}</option>)}
     </StudioSelect>
   </label>
   {invalidLayerShape&&<p className="warning" role="alert">Shaped crops require a photo without visible text, frames or shape layers in this release. Hide those layers before applying.</p>}
   {cropShape!=="rectangle"&&<p className="hint">Outside the shape remains transparent. Optimized arrangement increases packing density; Source order keeps design sequence. Cutout jobs support up to 200 copies per batch.</p>}
   {(!!error||!!raster.error||unavailable)&&<div className="crop-source-warning" role="alert">
     <p>{error||raster.error||"The photo source cannot be displayed."}</p>
     <button className="secondary-button" type="button" onClick={retryImage}>Retry photo</button>
     {fallback&&ready&&onRestoreOriginal&&<button className="secondary-button" type="button"
       onClick={onRestoreOriginal}>Restore original for this design</button>}
   </div>}
   <div className="crop-zoom">
     <PhotoAdjustmentRow id="crop-editor-zoom" label="Zoom" unit="%"
       ariaLabel="Crop zoom" min={100} max={800}
       value={Math.max(100,Math.min(800,Math.round(zoom*100)))}
       resetValue={100} disabled={!interactive} onChange={percent=>setZoom(percent/100)}/>
     <button className="icon-button" aria-label="Zoom out" disabled={!interactive}
       onClick={()=>setZoom(Math.max(1,zoom/1.25))}>−</button>
     <button className="icon-button" aria-label="Zoom in" disabled={!interactive}
       onClick={()=>setZoom(Math.min(8,zoom*1.25))}>+</button>
   </div>
   <div className="crop-actions">
     <label className="check-row"><input type="checkbox" checked={showGrid}
       onChange={e=>setGrid(e.target.checked)}/>Grid</label>
     <button className="secondary-button" disabled={!interactive} onClick={()=>commit(fit(),"reset")}>Reset</button>
     <button className="secondary-button" disabled={!interactive} onClick={()=>commit(fitCropToAspect(FULL_CROP,iw,ih,item.widthMm,item.heightMm),"fit")}>Fit</button>
   </div>
   <div className="two-inputs">
    <BoundedNumberField label="Source X (%)" value={Math.round(crop.x*10000)/100} min={0} max={Math.round((1-crop.width)*10000)/100} step={.01}
     onCommit={value=>{if(interactive)commit({...crop,x:Math.min(1-crop.width,value/100)},"position-x");}}/>
    <BoundedNumberField label="Source Y (%)" value={Math.round(crop.y*10000)/100} min={0} max={Math.round((1-crop.height)*10000)/100} step={.01}
     onCommit={value=>{if(interactive)commit({...crop,y:Math.min(1-crop.height,value/100)},"position-y");}}/>
   </div>
 </EditorWorkspace>;
}
