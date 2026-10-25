import {useEffect,useRef,useState} from "react";
import type {PointerEvent,KeyboardEvent} from "react";
import type {PhotoAsset} from "../core/exportPdf.ts";
import {fitCropToAspect,panCrop,zoomCrop} from "../core/crop.ts";
import type {CropRegion} from "../core/crop.ts";
import {photoFilterCss} from "../core/photoAdjustments.ts";
import {parseBoundedNumber} from "../core/safeNumbers.ts";
import {photoPreviewAsset,photoPreviewSource,photoSourceFailureMode} from "../core/photoSourceRecovery.ts";
import type {PhotoSourceMode} from "../core/photoSourceRecovery.ts";

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
 const [crop,setCrop]=useState<CropRegion>(fit);
 const cropRef=useRef(crop);
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
 const canApply=ready&&mode==="primary";
 const frameRatio=item.widthMm/item.heightMm;
 const displayCrop=fallback?displayAsset.crop:crop;
 const base=fitCropToAspect(item.crop,
   displayAsset.processedWidth??displayAsset.pixelWidth,
   displayAsset.processedHeight??displayAsset.pixelHeight,item.widthMm,item.heightMm);
 const zoom=Math.round(base.width/displayCrop.width*100)/100;
 const commit=(next:CropRegion)=>{cropRef.current=next;setCrop(next);};
 useEffect(()=>{
   // Changing the processed image can alter its aspect ratio and crop center.
   const next=fit();cropRef.current=next;setCrop(next);
   setLoadedKey("");setFailure(null);setError("");setRetry(0);
   pointers.current.clear();
 // This signature represents externally committed geometry, not local dragging.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[cropIdentity]);
 const point=(e:PointerEvent<HTMLDivElement>)=>{
   const rect=e.currentTarget.getBoundingClientRect();
   if(rect.width<=0||rect.height<=0)return null;
   return {x:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),
           y:Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))};
 };
 const move=(e:PointerEvent<HTMLDivElement>)=>{
   if(!canApply)return;
   const previous=pointers.current.get(e.pointerId),now=point(e);
   if(!previous||!now)return;
   const before=[...pointers.current.values()];
   pointers.current.set(e.pointerId,now);
   const after=[...pointers.current.values()];
   if(before.length>=2&&after.length>=2){
     const [a,b]=before,[c,d]=after;
     const dist0=Math.hypot(b.x-a.x,b.y-a.y),dist1=Math.hypot(d.x-c.x,d.y-c.y);
     if(dist0>0&&dist1>0){
       const mid0={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
       const mid1={x:(c.x+d.x)/2,y:(c.y+d.y)/2};
       let next=zoomCrop(cropRef.current,dist1/dist0,mid0.x,mid0.y);
       next=panCrop(next,mid1.x-mid0.x,mid1.y-mid0.y);
       commit(next);
     }
   }else commit(panCrop(cropRef.current,now.x-previous.x,now.y-previous.y));
 };
 const down=(e:PointerEvent<HTMLDivElement>)=>{
   if(!canApply)return;
   const p=point(e);if(!p)return;
   e.currentTarget.setPointerCapture(e.pointerId);
   pointers.current.set(e.pointerId,p);
 };
 const up=(e:PointerEvent<HTMLDivElement>)=>{pointers.current.delete(e.pointerId);};
 useEffect(()=>{
   const el=stageRef.current;
   if(!el||!canApply)return;
   const handle=(e:WheelEvent)=>{
     e.preventDefault();
     const rect=el.getBoundingClientRect();
     if(!rect.width||!rect.height)return;
     const x=(e.clientX-rect.left)/rect.width,y=(e.clientY-rect.top)/rect.height;
     commit(zoomCrop(cropRef.current,Math.exp(-e.deltaY/460),x,y));
   };
   el.addEventListener("wheel",handle,{passive:false});
   return()=>el.removeEventListener("wheel",handle);
 },[canApply]);
 const key=(e:KeyboardEvent<HTMLDivElement>)=>{
   if(!canApply)return;
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
   if(!canApply||!Number.isFinite(value)||value<1||value>8)return;
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
 return <section className="crop-editor" aria-label="Photo framing editor">
   <div className="crop-toolbar">
     <div><h2>Crop &amp; frame</h2><p>Move the photo inside the fixed print window.</p></div>
     <button className="icon-button crop-close" onClick={onClose} aria-label="Close crop editor">×</button>
   </div>
   {(!!error||unavailable)&&<div className="crop-source-warning" role="alert">
     <p>{error||"The photo source cannot be displayed."}</p>
     <button className="secondary-button" type="button" onClick={retryImage}>Retry photo</button>
     {fallback&&ready&&onRestoreOriginal&&<button className="secondary-button" type="button"
       onClick={onRestoreOriginal}>Restore original for this design</button>}
   </div>}
   <div ref={stageRef} className="crop-view" style={{aspectRatio:String(frameRatio)}} role="group"
     tabIndex={0} aria-label="Drag to move photo; pinch, scroll or use the slider to zoom"
     onPointerDown={down} onPointerMove={move} onPointerUp={up}
     onPointerCancel={up} onLostPointerCapture={up} onKeyDown={key}>
     {source&&<img key={imageKey} src={source} alt={item.name} draggable={false}
       onLoad={()=>setLoadedKey(imageKey)} onError={imageFailed}
       style={{filter:photoFilterCss(item.adjustments),width:(100/displayCrop.width)+"%",
         height:(100/displayCrop.height)+"%",left:(-100*displayCrop.x/displayCrop.width)+"%",
         top:(-100*displayCrop.y/displayCrop.height)+"%"}}/>}
     {!ready&&!unavailable&&<span className="crop-loading" role="status">Loading photo…</span>}
     {showGrid&&<div className="crop-grid" aria-hidden="true"/>}
     <span className="crop-frame-corner top-left"/><span className="crop-frame-corner top-right"/>
     <span className="crop-frame-corner bottom-left"/><span className="crop-frame-corner bottom-right"/>
   </div>
   <div className="crop-zoom">
     <button className="icon-button" aria-label="Zoom out" disabled={!canApply}
       onClick={()=>setZoom(Math.max(1,zoom/1.25))}>−</button>
     <label>Zoom <input type="range" min="1" max="8" step=".01" value={Math.min(8,zoom)}
       disabled={!canApply} onChange={e=>{
         const value=parseBoundedNumber(e.target.value,1,8);
         if(value!==null)setZoom(value);
       }}/></label>
     <button className="icon-button" aria-label="Zoom in" disabled={!canApply}
       onClick={()=>setZoom(Math.min(8,zoom*1.25))}>+</button>
     <span className="crop-zoom-value">{Math.round(zoom*100)}%</span>
   </div>
   <div className="crop-actions">
     <label className="check-row"><input type="checkbox" checked={showGrid}
       onChange={e=>setGrid(e.target.checked)}/>Grid</label>
     <button className="secondary-button" disabled={!canApply} onClick={()=>commit(fit())}>Reset</button>
     <span className="crop-output">{item.widthMm} × {item.heightMm} mm</span>
     <button className="primary-button" disabled={!canApply}
       onClick={()=>{if(!canApply)return;onUpdate(cropRef.current);onClose();}}>Apply crop</button>
   </div>
 </section>;
}
