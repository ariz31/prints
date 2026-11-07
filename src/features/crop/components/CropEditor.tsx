import {useEffect,useRef,useState} from "react";
import type {CSSProperties,PointerEvent,KeyboardEvent} from "react";
import type {PhotoAsset} from "../../../core/exportPdf.ts";
import {fitCropToAspect,panCrop,zoomCrop,FULL_CROP} from "../../../core/crop.ts";
import type {CropRegion} from "../../../core/crop.ts";
import {liveCropImageStyle,canUseLiveCropPreview} from "../../../core/liveCropPreview.ts";
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
import CropBoundsOverlay from "./CropBoundsOverlay.tsx";
import { resizeCropRegion } from "../logic/studioGeometry.ts";

interface Props{
 item:PhotoAsset;
 onUpdate:(value:{crop:CropRegion;cropShape:CropShape;widthMm:number;heightMm:number})=>void;
 onClose:()=>void;
 onRestoreOriginal?:()=>void;
}
/** A crop is committed only after its actual source has successfully loaded. */
export default function CropEditor({item,onUpdate,onClose,onRestoreOriginal}:Props){
 const iw=item.processedWidth??item.pixelWidth,ih=item.processedHeight??item.pixelHeight;
 const fit=()=>fitCropToAspect(item.crop,iw,ih,item.widthMm,item.heightMm);
 const history=useEditorHistory<{region:CropRegion;shape:CropShape;widthMm:number;heightMm:number}>(()=>({
   region:fit(),shape:item.cropShape??"rectangle",
   widthMm:item.widthMm,heightMm:item.heightMm,
 }));
 const widthMm=history.value.widthMm,heightMm=history.value.heightMm;
 const [unit,setUnit]=useState<"mm"|"cm"|"in"|"px">("mm");
 const [lockAspect,setLockAspect]=useState(true);
 const [aspectPreset,setAspectPreset]=useState("custom");
 const dpi=300;
 const displayDimension=(mm:number)=>unit==="mm"?mm:
   unit==="cm"?mm/10:unit==="in"?mm/25.4:mm/25.4*dpi;
 const toMillimeters=(value:number)=>unit==="mm"?value:
   unit==="cm"?value*10:unit==="in"?value*25.4:value/dpi*25.4;
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
 const raster=useCropRaster({...displayAsset,crop:fallback?displayAsset.crop:crop,
   cropShape,widthMm,heightMm},ready,retry,stageRef);
 const preferLive=canUseLiveCropPreview(displayAsset.adjustments);
 const canApply=interactive&&raster.ready&&!invalidLayerShape;
 const frameRatio=widthMm/heightMm;
 const displayCrop=fallback?displayAsset.crop:crop;
 const base=fitCropToAspect(FULL_CROP,
   displayAsset.processedWidth??displayAsset.pixelWidth,
   displayAsset.processedHeight??displayAsset.pixelHeight,widthMm,heightMm);
 const zoom=Math.round(base.width/displayCrop.width*100)/100;
 const sourceAspect=widthMm*ih/(heightMm*iw);
 const commit=(next:CropRegion,key="gesture")=>{
   const previous=cropRef.current;
   if(next===previous || (
     Math.abs(next.x-previous.x)<1e-12 && Math.abs(next.y-previous.y)<1e-12 &&
     Math.abs(next.width-previous.width)<1e-12 &&
     Math.abs(next.height-previous.height)<1e-12)) return;
   cropRef.current=next;history.change({...history.value,region:next},key);
 };
 useEffect(()=>{
   // Changing the processed image can alter its aspect ratio and crop center.
   const next=fit();cropRef.current=next;
   history.reset({region:next,shape:item.cropShape??"rectangle",
     widthMm:item.widthMm,heightMm:item.heightMm});
   setLockAspect(true);setAspectPreset("custom");
   setLoadedKey("");setFailure(null);setError("");setRetry(0);
   pointers.current.clear();
 // This signature represents externally committed geometry, not local dragging.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[cropIdentity]);
 const setOutputSize=(w:number,h:number,key:string)=>{
   if(![w,h].every(v=>Number.isFinite(v)&&v>=0.1&&v<=2000))return;
   const next=fitCropToAspect(cropRef.current,iw,ih,w,h);
   cropRef.current=next;
   history.change({...history.value,region:next,widthMm:w,heightMm:h},key);
 };
 const adjustSize=(axis:"width"|"height",value:number)=>{
   const mm=toMillimeters(value);
   if(!Number.isFinite(mm)||mm<0.1||mm>2000)return;
   const ratio=frameRatio;
   setOutputSize(axis==="width"?mm:lockAspect?mm*ratio:widthMm,
     axis==="height"?mm:lockAspect?mm/ratio:heightMm,"print-dimensions");
   if(!lockAspect)setAspectPreset("free");
 };
 const chooseRatio=(value:string)=>{
   setAspectPreset(value);
   if(value==="free"){setLockAspect(false);return;}
   setLockAspect(true);
   const ratios:Record<string,number>={"1:1":1,"4:3":4/3,"3:2":3/2,"16:9":16/9};
   const ratio=ratios[value];
   if(ratio){
     const w=Math.min(widthMm,2000*ratio);
     setOutputSize(w,w/ratio,"aspect-preset");
   }
 };
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
       style={{...liveCropImageStyle(displayCrop,item.adjustments),visibility:raster.ready&&!preferLive?"hidden":undefined}}/>}
     {raster.url&&<img key={raster.url} src={raster.url} alt="Exact computed print crop" onLoad={event=>raster.loaded(event.currentTarget.src)} onError={raster.failed}
       style={{inset:0,width:"100%",height:"100%",visibility:raster.ready&&!preferLive?undefined:"hidden"}}/>}
     {showGrid&&<div className="crop-grid" aria-hidden="true"/>}
     </div>
     {cropShape!=="rectangle"&&<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
       style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:3}}>
       <polygon points={cropShapePoints(cropShape).map(p=>(p.x*100)+","+(p.y*100)).join(" ")}
         fill="none" stroke="white" strokeWidth=".45" strokeDasharray="1.5 .9"/>
     </svg>}
     {!ready&&!unavailable&&<span className="crop-loading" role="status">Loading photo…</span>}
     <CropBoundsOverlay crop={crop} sourceRatio={sourceAspect}
       onResize={commit} disabled={!interactive}/> 
   </div>;
 return <EditorWorkspace title="Crop & frame" name={item.name} className="crop-workspace"
   onCancel={onClose} onApply={()=>{if(canApply){onUpdate({crop:cropRef.current,cropShape,
     widthMm,heightMm});onClose();}}}
   applyLabel="Apply crop" disabled={!canApply} stage={stage}
   undo={()=>{if(interactive){history.undo();pointers.current.clear();}}}
   redo={()=>{if(interactive){history.redo();pointers.current.clear();}}}
   canUndo={history.canUndo&&interactive} canRedo={history.canRedo&&interactive}
   tools={<span className="crop-output">{widthMm.toFixed(2)} × {heightMm.toFixed(2)} mm · {Math.round(zoom*100)}%</span>}>
   <h2>Print dimensions</h2>
   <label className="print-field"><span className="field-label">Unit</span>
     <StudioSelect aria-label="Crop print size units" value={unit}
       onChange={event=>setUnit(event.target.value as typeof unit)}>
       <option value="mm">Millimeters (mm)</option>
       <option value="cm">Centimeters (cm)</option>
       <option value="in">Inches (in)</option>
       <option value="px">Pixels (300 DPI)</option>
     </StudioSelect>
   </label>
   <label className="print-field"><span className="field-label">Print aspect ratio</span>
     <StudioSelect aria-label="Crop print aspect ratio" value={aspectPreset}
       onChange={event=>chooseRatio(event.target.value)}>
       <option value="free">Free</option>
       <option value="1:1">1:1</option>
       <option value="4:3">4:3</option>
       <option value="3:2">3:2</option>
       <option value="16:9">16:9</option>
       <option value="custom">Custom</option>
     </StudioSelect>
   </label>
   <label className="check-row"><input type="checkbox" checked={lockAspect}
     onChange={event=>{setLockAspect(event.target.checked);
       if(!event.target.checked)setAspectPreset("free");
       else setAspectPreset("custom");}}/>
     Lock print aspect ratio</label>
   <div className="two-inputs">
     <BoundedNumberField key={"width-"+unit} label={"Print width ("+unit+")"}
       value={Math.round(displayDimension(widthMm)*10000)/10000}
       min={Math.max(0.0001,displayDimension(.1))}
       max={displayDimension(2000)} step="any"
       onCommit={value=>{if(interactive)adjustSize("width",value);}}/>
     <BoundedNumberField key={"height-"+unit} label={"Print height ("+unit+")"}
       value={Math.round(displayDimension(heightMm)*10000)/10000}
       min={Math.max(0.0001,displayDimension(.1))}
       max={displayDimension(2000)} step="any"
       onCommit={value=>{if(interactive)adjustSize("height",value);}}/>
   </div>
   <p className="hint">Source crop follows the new print ratio without stretching. Pixel values use the 300 DPI reference; actual export DPI is selected in Print settings.</p>
   <h2>Framing</h2><p className="hint">Drag inside the frame to move the image. Drag a corner or edge handle to change the source crop while keeping the print aspect ratio. Focus a handle and use arrow keys for precise resizing; pinch or scroll to zoom.</p>
   <label className="print-field"><span className="field-label">Crop shape · 15 presets</span>
     <StudioSelect aria-label="Crop shape" value={cropShape}
       onChange={event=>setCropShape(event.target.value as CropShape)}>
       {CROP_SHAPES.map(shape=><option key={shape.id} value={shape.id}>{shape.label}</option>)}
     </StudioSelect>
   </label>
   {invalidLayerShape&&<p className="warning" role="alert">Shaped crops require a photo without visible text, frames or shape layers in this release. Hide those layers before applying.</p>}
   {cropShape!=="rectangle"&&<p className="hint">Outside the shape stays transparent. Optimized packing fits up to 200 cutouts per batch; Source order preserves design sequence.</p>}
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
    <BoundedNumberField label="Source width (%)" value={Math.round(crop.width*10000)/100}
      min={1} max={100} step={.01}
      onCommit={value=>{if(interactive)commit(resizeCropRegion(crop,"e",
        value/100-crop.width,0,{ratio:sourceAspect}),"source-width");}}/>
    <BoundedNumberField label="Source height (%)" value={Math.round(crop.height*10000)/100}
      min={1} max={100} step={.01}
      onCommit={value=>{if(interactive)commit(resizeCropRegion(crop,"s",
        0,value/100-crop.height,{ratio:sourceAspect}),"source-height");}}/>
   </div>
   <p className="hint">Source: {Math.round(crop.width*iw)} × {Math.round(crop.height*ih)} px · Print: {widthMm.toFixed(2)} × {heightMm.toFixed(2)} mm. Crop edges stay aligned to the requested physical aspect ratio.</p>
   <div className="two-inputs">
    <BoundedNumberField label="Source X (%)" value={Math.round(crop.x*10000)/100} min={0} max={Math.round((1-crop.width)*10000)/100} step={.01}
     onCommit={value=>{if(interactive)commit({...crop,x:Math.min(1-crop.width,value/100)},"position-x");}}/>
    <BoundedNumberField label="Source Y (%)" value={Math.round(crop.y*10000)/100} min={0} max={Math.round((1-crop.height)*10000)/100} step={.01}
     onCommit={value=>{if(interactive)commit({...crop,y:Math.min(1-crop.height,value/100)},"position-y");}}/>
   </div>
 </EditorWorkspace>;
}
