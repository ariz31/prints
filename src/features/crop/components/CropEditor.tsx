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
import PolygonPointOverlay from "./PolygonPointOverlay.tsx";
import StudioFrameOverlay from "./StudioFrameOverlay.tsx";
import PerspectiveHandlesOverlay from "./PerspectiveHandlesOverlay.tsx";
import {cropShapePoints as presetShapePoints} from "../logic/cropShapes.ts";
import {validCustomPolygon} from "../logic/studioGeometry.ts";
import {snapCropPosition} from "../logic/cropSnapping.ts";
import type {ShapePoint} from "../../../domain/models/crop.ts";
import {
  readCropTemplates,writeCropTemplates,savedCropTemplate,insertCropTemplate,
  renameCropTemplate,duplicateCropTemplate,deleteCropTemplate,
} from "../logic/cropTemplateLibrary.ts";
import type {SavedCropTemplate} from "../logic/cropTemplateLibrary.ts";
import { resizeCropRegion } from "../logic/studioGeometry.ts";
import { normalizeAdjustments } from "../../../core/photoAdjustments.ts";
import {migrateLegacyCropStudio,validCropStudioDocument} from "../logic/studioDocument.ts";
import type {CropStudioDocument} from "../logic/studioDocument.ts";
import {FRAME_PRESETS} from "../../frames/logic/frames.ts";
import type { PhotoAdjustments } from "../../../core/photoAdjustments.ts";

interface Props{
 item:PhotoAsset;
 onUpdate:(value:{crop:CropRegion;cropShape:CropShape;cropPolygon?:ShapePoint[];
   widthMm:number;heightMm:number;adjustments:PhotoAdjustments;
   cropStudio:CropStudioDocument})=>void;
 onClose:()=>void;
 onRestoreOriginal?:()=>void;
}
/** A crop is committed only after its actual source has successfully loaded. */
export default function CropEditor({item,onUpdate,onClose,onRestoreOriginal}:Props){
 const iw=item.processedWidth??item.pixelWidth,ih=item.processedHeight??item.pixelHeight;
 const fit=()=>fitCropToAspect(item.crop,iw,ih,item.widthMm,item.heightMm);
 const originalStudio=():CropStudioDocument=>{
   const legacy=migrateLegacyCropStudio({crop:fit(),cropShape:item.cropShape,
     widthMm:item.widthMm,heightMm:item.heightMm});
   const base=item.cropStudio&&validCropStudioDocument(item.cropStudio)
     ?item.cropStudio:legacy;
   return {...base,crop:fit(),
     aspect:{locked:true,ratio:item.widthMm/item.heightMm},
     shape:{...base.shape,preset:item.cropPolygon?"custom":item.cropShape??"rectangle",
       vertices:item.cropPolygon?.map(point=>({...point}))},
     output:{...base.output,widthMm:item.widthMm,heightMm:item.heightMm}};
 };
 const history=useEditorHistory<{region:CropRegion;shape:CropShape|"custom";
   polygon?:ShapePoint[];widthMm:number;heightMm:number;
   adjustments:PhotoAdjustments;studio:CropStudioDocument}>(()=>({
   region:fit(),shape:item.cropPolygon?"custom":item.cropShape??"rectangle",
   polygon:item.cropPolygon?.map(p=>({...p})),
   widthMm:item.widthMm,heightMm:item.heightMm,
   adjustments:normalizeAdjustments(item.adjustments),
   studio:originalStudio(),
 }));
 const widthMm=history.value.widthMm,heightMm=history.value.heightMm;
 const draftAdjustments=history.value.adjustments;
 const studio=history.value.studio;
 const updateStudio=(next:CropStudioDocument,key="studio")=>{
   if(!validCropStudioDocument(next)){
     setError("The proposed frame or perspective geometry is invalid.");return;
   }
   setError("");
   history.change({...history.value,studio:next},key);
 };
 const updateImageTransform=(patch:Partial<CropStudioDocument["imageTransform"]>)=>
   updateStudio({...studio,imageTransform:{...studio.imageTransform,...patch}},"studio-image");
 const updateCropTransform=(patch:Partial<CropStudioDocument["cropTransform"]>)=>
   updateStudio({...studio,cropTransform:{...studio.cropTransform,...patch}},"studio-crop");
 const updateFrame=(patch:Partial<CropStudioDocument["frame"]>)=>
   updateStudio({...studio,frame:{...studio.frame,...patch}},"studio-frame");
 const [unit,setUnit]=useState<"mm"|"cm"|"in"|"px">("mm");
 const [templates,setTemplates]=useState<SavedCropTemplate[]>(readCropTemplates);
 const [selectedTemplate,setSelectedTemplate]=useState("");
 const [templateName,setTemplateName]=useState("");
 const [templateError,setTemplateError]=useState("");
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
 const [activeTool,setActiveTool]=useState<"crop"|"shape"|"frame"|"perspective">("crop");
 const [showGolden,setGolden]=useState(false);
 const [showRulers,setRulers]=useState(false);
 const [showSnapping,setSnapping]=useState(true);
 const [snapSensitivity,setSnapSensitivity]=useState(8);
 const [gridSpacing,setGridSpacing]=useState(10);
 const cropShape=history.value.shape;
 const cropPolygon=cropShape==="custom"?history.value.polygon:undefined;
 const [vertexIndex,setVertexIndex]=useState(0);
 const setCropShape=(next:CropShape|"custom")=>{
   const candidate=(history.value.polygon??presetShapePoints(cropShape==="custom"?"rectangle":cropShape)).map(p=>({...p}));
   const polygon=next==="custom"
     ?(validCustomPolygon(candidate)?candidate:presetShapePoints("rectangle").map(p=>({...p})))
     :undefined;
   history.change({...history.value,shape:next,polygon},"shape");
   setVertexIndex(0);
 };
 const setPolygon=(next:ShapePoint[])=>{
   if(validCustomPolygon(next))history.change({...history.value,shape:"custom",polygon:next},"polygon");
 };
 const resolvedShape:CropShape=cropShape==="custom"?"rectangle":cropShape;
 const layered=(item.layers??[]).some(layer=>layer.visible);
 const invalidLayerShape=layered&&(cropShape!=="rectangle"||!!cropPolygon);
 const [retry,setRetry]=useState(0);
 const [loadedKey,setLoadedKey]=useState("");
 const [error,setError]=useState("");
 const [failure,setFailure]=useState<{identity:string;mode:PhotoSourceMode}|null>(null);
 const sourceIdentity=JSON.stringify([item.url,item.processedUrl??null]);
 const cropIdentity=JSON.stringify([sourceIdentity,item.crop,item.pixelWidth,item.pixelHeight,
   item.processedWidth,item.processedHeight,item.widthMm,item.heightMm,
   item.cropShape,item.cropPolygon,item.cropStudio]);
 const mode=failure?.identity===sourceIdentity?failure.mode:"primary";
 const unavailable=mode==="unavailable";
 const fallback=mode==="original";
 const displayAsset=photoPreviewAsset(item,mode);
 const source=photoPreviewSource(item,mode);
 const imageKey=(source??"unavailable")+":"+retry+":"+sourceIdentity;
 const ready=!!source&&loadedKey===imageKey;
 const interactive=ready&&mode==="primary";
 const raster=useCropRaster({...displayAsset,crop:fallback?displayAsset.crop:crop,
   cropShape:resolvedShape,cropPolygon,widthMm,heightMm,
   adjustments:draftAdjustments,cropStudio:{
     ...studio,crop,aspect:{locked:true,ratio:widthMm/heightMm},
     output:{...studio.output,widthMm,heightMm}
   }},ready,retry,stageRef);
 const preferLive=canUseLiveCropPreview(draftAdjustments);
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
   history.reset({region:next,shape:item.cropPolygon?"custom":item.cropShape??"rectangle",
     polygon:item.cropPolygon?.map(p=>({...p})),
     widthMm:item.widthMm,heightMm:item.heightMm,
     adjustments:normalizeAdjustments(item.adjustments),
     studio:originalStudio()});
   setVertexIndex(0);
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
   history.change({...history.value,region:next,widthMm:w,heightMm:h,
     studio:{...studio,crop:next,aspect:{locked:true,ratio:w/h},
       output:{...studio.output,widthMm:w,heightMm:h}}},key);
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
 const commitTemplates=(change:(current:SavedCropTemplate[])=>SavedCropTemplate[]):boolean=>{
   try{
     const next=change(templates);
     writeCropTemplates(next);
     setTemplates(next);setTemplateError("");
     return true;
   }catch(error){
     setTemplateError(error instanceof Error?error.message:"Cannot save template.");
     return false;
   }
 };
 const applySavedTemplate=()=>{
   const template=templates.find(t=>t.id===selectedTemplate);
   if(!template||!interactive)return;
   const next=fitCropToAspect(template.crop,iw,ih,template.widthMm,template.heightMm);
   cropRef.current=next;
   history.change({...history.value,region:next,
     shape:template.cropPolygon?"custom":template.cropShape,
     polygon:template.cropPolygon?.map(p=>({...p})),
     widthMm:template.widthMm,heightMm:template.heightMm,
     adjustments:{...draftAdjustments,...template.orientation}},"apply-template");
   setVertexIndex(0);setActiveTool("crop");setLockAspect(true);setAspectPreset("custom");
 };
 const saveCurrentTemplate=()=>{
   try{
     const id=crypto.randomUUID();
     const template=savedCropTemplate(id,templateName,{
       crop:{...cropRef.current},cropShape:resolvedShape,
       cropPolygon:cropPolygon?.map(p=>({...p})),widthMm,heightMm,
       orientation:{rotation:draftAdjustments.rotation??0,
         straighten:draftAdjustments.straighten??0,
         flipX:!!draftAdjustments.flipX,flipY:!!draftAdjustments.flipY},
     });
     if(commitTemplates(current=>insertCropTemplate(current,template)))
       setSelectedTemplate(id);
   }catch(error){setTemplateError(error instanceof Error?error.message:"Cannot save template.");}
 };
 const changeTransform=(patch:Partial<PhotoAdjustments>)=>{
   history.change({...history.value,
     adjustments:{...draftAdjustments,...patch}},"image-transform");
 };
 const resetTransform=()=>changeTransform({
   rotation:0,straighten:0,flipX:false,flipY:false
 });
 const move=(e:PointerEvent<HTMLDivElement>)=>{
   if(!interactive||!pointers.current.has(e.pointerId))return;
   const before=[...pointers.current.values()];
   pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
   const bounds=e.currentTarget.getBoundingClientRect();
   const next=gestureCrop(cropRef.current,before,[...pointers.current.values()],bounds);
   const snapped=pointers.current.size===1&&!e.altKey
     ?snapCropPosition(next,{enabled:showSnapping,sensitivityPx:snapSensitivity,
       viewportWidthPx:bounds.width,viewportHeightPx:bounds.height})
     :next;
   commit(snapped);
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
       pointerEvents:"none",clipPath:shapeClipPath(resolvedShape,false,cropPolygon)}}>
     {source&&<img key={imageKey} src={source} alt={item.name} draggable={false}
       onLoad={()=>setLoadedKey(imageKey)} onError={imageFailed}
       style={{...liveCropImageStyle(displayCrop,draftAdjustments),visibility:raster.ready&&!preferLive?"hidden":undefined}}/>}
     {raster.url&&<img key={raster.url} src={raster.url} alt="Exact computed print crop" onLoad={event=>raster.loaded(event.currentTarget.src)} onError={raster.failed}
       style={{inset:0,width:"100%",height:"100%",visibility:raster.ready&&!preferLive?undefined:"hidden"}}/>}
     {showGrid&&<div className="crop-grid" aria-hidden="true"/>}
     {showGrid&&<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
       style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
       {Array.from({length:Math.floor(99/gridSpacing)},(_,i)=>(i+1)*gridSpacing)
         .map((v,i)=><g key={i} stroke="#ffffff" strokeOpacity=".28" strokeWidth=".12">
           <line x1={v} y1={0} x2={v} y2={100}/>
           <line x1={0} y1={v} x2={100} y2={v}/>
         </g>)}
     </svg>}
     {showGolden&&<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
       style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
       {[38.1966,61.8034].map(v=><g key={v} stroke="#f4c457" strokeWidth=".24" strokeDasharray=".9 .8">
         <line x1={v} y1={0} x2={v} y2={100}/>
         <line x1={0} y1={v} x2={100} y2={v}/>
       </g>)}
     </svg>}
     {showRulers&&<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
       style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
       {Array.from({length:11},(_,i)=>i*10).map(v=><g key={v} stroke="#ffffff"
         strokeWidth=".24" fontSize="2.7" fill="#ffffff" paintOrder="stroke">
           <line x1={v} y1={0} x2={v} y2={2}/>
           <line x1={0} y1={v} x2={2} y2={v}/>
           {v<100&&<text x={v+1} y={5}>{v}%</text>}
         </g>)}
     </svg>}
     </div>
     {(cropShape!=="rectangle"||!!cropPolygon)&&<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
       style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:3}}>
       <polygon points={cropShapePoints(resolvedShape,cropPolygon).map(p=>(p.x*100)+","+(p.y*100)).join(" ")}
         fill="none" stroke="white" strokeWidth=".45" strokeDasharray="1.5 .9"/>
     </svg>}
     {!ready&&!unavailable&&<span className="crop-loading" role="status">Loading photo…</span>}
     {activeTool==="crop"&&<CropBoundsOverlay crop={crop} sourceRatio={sourceAspect}
       onResize={commit} disabled={!interactive}/>}
     {activeTool==="shape"&&cropPolygon&&<PolygonPointOverlay points={cropPolygon}
       selected={vertexIndex} onSelect={setVertexIndex}
       onChange={setPolygon} disabled={!interactive}/>}
     {activeTool==="frame"&&<StudioFrameOverlay frame={studio.frame}
       onChange={bounds=>updateFrame({bounds})} disabled={!interactive}/>}
     {activeTool==="perspective"&&studio.imageTransform.perspective&&
       <PerspectiveHandlesOverlay quad={studio.imageTransform.perspective}
         onChange={perspective=>updateImageTransform({perspective})}
         disabled={!interactive}/>} 
   </div>;
 return <EditorWorkspace title="Crop & frame" name={item.name} className="crop-workspace"
   onCancel={onClose} onApply={()=>{if(canApply){
     const doc:CropStudioDocument={...studio,crop:cropRef.current,
       aspect:{locked:true,ratio:widthMm/heightMm},
       shape:{...studio.shape,preset:cropPolygon?"custom":resolvedShape,
         vertices:cropPolygon?.map(p=>({...p}))},
       output:{...studio.output,widthMm,heightMm}};
     if(!validCropStudioDocument(doc)){
       setError("Cannot apply an invalid frame or crop. Review the settings.");
       return;
     }
     onUpdate({crop:cropRef.current,cropShape:resolvedShape,
       cropPolygon,widthMm,heightMm,adjustments:draftAdjustments,cropStudio:doc});
     onClose();
   }}}
   applyLabel="Apply crop" disabled={!canApply} stage={stage}
   undo={()=>{if(interactive){history.undo();pointers.current.clear();}}}
   redo={()=>{if(interactive){history.redo();pointers.current.clear();}}}
   canUndo={history.canUndo&&interactive} canRedo={history.canRedo&&interactive}
   tools={<span className="crop-output">{widthMm.toFixed(2)} × {heightMm.toFixed(2)} mm · {Math.round(zoom*100)}%</span>}>
   <div role="group" aria-label="Crop Studio editing mode" className="crop-actions">
     <button type="button" className="secondary-button" aria-pressed={activeTool==="crop"}
       onClick={()=>setActiveTool("crop")}>Crop</button>
     <button type="button" className="secondary-button" aria-pressed={activeTool==="shape"}
       disabled={!cropPolygon} onClick={()=>setActiveTool("shape")}>Shape</button>
     <button type="button" className="secondary-button" aria-pressed={activeTool==="frame"}
       onClick={()=>setActiveTool("frame")}>Frame</button>
     <button type="button" className="secondary-button" aria-pressed={activeTool==="perspective"}
       disabled={!studio.imageTransform.perspective}
       onClick={()=>setActiveTool("perspective")}>Perspective</button>
   </div>
   <details className="crop-studio-panel" open><summary>Crop &amp; print size</summary>
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
   </details>
   <details className="crop-studio-panel"><summary>Saved crop templates</summary>
   <p className="hint">Templates store geometry and orientation only; they never duplicate an original photo. Applying to another image refits its single crop to the intended print size.</p>
   <label className="print-field"><span className="field-label">Saved template</span>
     <StudioSelect aria-label="Saved crop template" value={selectedTemplate}
       onChange={event=>{const id=event.target.value;setSelectedTemplate(id);
         setTemplateName(templates.find(t=>t.id===id)?.name??"");}}>
       <option value="">Select a template</option>
       {templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
     </StudioSelect>
   </label>
   <label className="print-field"><span className="field-label">Template name</span>
     <input aria-label="Crop template name" type="text" maxLength={60}
       value={templateName} onChange={event=>setTemplateName(event.target.value)}/>
   </label>
   <div className="crop-actions">
     <button type="button" className="secondary-button" disabled={!interactive}
       onClick={saveCurrentTemplate}>Save new</button>
     <button type="button" className="secondary-button"
       disabled={!interactive||!selectedTemplate} onClick={applySavedTemplate}>Apply</button>
     <button type="button" className="secondary-button" disabled={!selectedTemplate}
       onClick={()=>commitTemplates(current=>renameCropTemplate(current,selectedTemplate,templateName))}>
       Rename</button>
     <button type="button" className="secondary-button" disabled={!selectedTemplate}
       onClick={()=>{const id=crypto.randomUUID();const name=templateName.trim()+" copy";
         if(commitTemplates(current=>duplicateCropTemplate(current,selectedTemplate,id,name))){
           setSelectedTemplate(id);setTemplateName(name);
         }}}>
       Duplicate</button>
     <button type="button" className="secondary-button" disabled={!selectedTemplate}
       onClick={()=>{if(commitTemplates(current=>deleteCropTemplate(current,selectedTemplate))){
         setSelectedTemplate("");setTemplateName("");
       }}}>Delete</button>
   </div>
   {templateError&&<p role="alert" className="warning">{templateError}</p>}
   </details>
   <details className="crop-studio-panel"><summary>Image transformations</summary>
   <p className="hint">These orientation controls reuse PRINTS photo adjustments, so they are applied once in both normal and high-resolution printing.</p>
   <div className="crop-actions">
     <button type="button" className="secondary-button" disabled={!interactive}
       onClick={()=>changeTransform({rotation:((draftAdjustments.rotation??0)+270)%360})}>
       Rotate 90° left</button>
     <button type="button" className="secondary-button" disabled={!interactive}
       onClick={()=>changeTransform({rotation:((draftAdjustments.rotation??0)+90)%360})}>
       Rotate 90° right</button>
     <button type="button" className="secondary-button" disabled={!interactive}
       onClick={()=>changeTransform({rotation:((draftAdjustments.rotation??0)+180)%360})}>
       Rotate 180°</button>
   </div>
   <div className="crop-actions">
     <button type="button" className="secondary-button" disabled={!interactive}
       aria-pressed={!!draftAdjustments.flipX}
       onClick={()=>changeTransform({flipX:!draftAdjustments.flipX})}>Flip horizontal</button>
     <button type="button" className="secondary-button" disabled={!interactive}
       aria-pressed={!!draftAdjustments.flipY}
       onClick={()=>changeTransform({flipY:!draftAdjustments.flipY})}>Flip vertical</button>
     <button type="button" className="secondary-button" disabled={!interactive}
       onClick={resetTransform}>Reset orientation</button>
   </div>
   <PhotoAdjustmentRow id="crop-fine-straighten" label="Fine straighten" unit="°"
     ariaLabel="Crop fine straighten" min={-15} max={15}
     value={draftAdjustments.straighten??0} resetValue={0}
     disabled={!interactive} onChange={value=>changeTransform({straighten:value})}/>
   </details>
   <details className="crop-studio-panel" open><summary>Shapes &amp; framing</summary>
   <p className="hint">Drag inside the frame to move the image. Drag a corner or edge handle to change the source crop while keeping the print aspect ratio. Focus a handle and use arrow keys for precise resizing; pinch or scroll to zoom.</p>
   <label className="print-field"><span className="field-label">Crop shape · 15 presets</span>
     <StudioSelect aria-label="Crop shape" value={cropShape}
       onChange={event=>setCropShape(event.target.value as CropShape|"custom")}>
       {CROP_SHAPES.map(shape=><option key={shape.id} value={shape.id}>{shape.label}</option>)}
       <option value="custom">Editable polygon</option>
     </StudioSelect>
   </label>
   {invalidLayerShape&&<p className="warning" role="alert">Shaped crops require a photo without visible text, frames or shape layers in this release. Hide those layers before applying.</p>}
   {(cropShape!=="rectangle"||!!cropPolygon)&&<p className="hint">Outside the shape stays transparent. Shape-aware packing fits up to 200 cutouts per batch. Each image still has one crop.</p>}
   {cropPolygon&&<section aria-label="Editable contour">
     <p className="hint">Select a vertex on the canvas to move it; arrow keys allow fine control. Invalid self-intersections are rejected.</p>
     <div className="two-inputs">
       <BoundedNumberField label="Vertex X (%)" min={0} max={100} step={.01}
         value={Math.round((cropPolygon[vertexIndex]?.x??0)*10000)/100}
         onCommit={value=>setPolygon(cropPolygon.map((p,i)=>i===vertexIndex?{x:value/100,y:p.y}:p))}/>
       <BoundedNumberField label="Vertex Y (%)" min={0} max={100} step={.01}
         value={Math.round((cropPolygon[vertexIndex]?.y??0)*10000)/100}
         onCommit={value=>setPolygon(cropPolygon.map((p,i)=>i===vertexIndex?{x:p.x,y:value/100}:p))}/>
     </div>
     <div className="crop-actions">
       <button type="button" className="secondary-button" disabled={cropPolygon.length>=128}
         onClick={()=>{
           let edge=0,length=-1;
           cropPolygon.forEach((p,i)=>{const q=cropPolygon[(i+1)%cropPolygon.length];
             const d=Math.hypot(q.x-p.x,q.y-p.y);
             if(d>length){length=d;edge=i;}
           });
           const p=cropPolygon[edge],q=cropPolygon[(edge+1)%cropPolygon.length];
           const next=[...cropPolygon];
           next.splice(edge+1,0,{x:(p.x+q.x)/2,y:(p.y+q.y)/2});
           setPolygon(next);setVertexIndex(edge+1);
         }}>Add vertex</button>
       <button type="button" className="secondary-button" disabled={cropPolygon.length<=3}
         onClick={()=>{setPolygon(cropPolygon.filter((_,i)=>i!==vertexIndex));
           setVertexIndex(Math.max(0,vertexIndex-1));}}>Delete vertex</button>
       <button type="button" className="secondary-button"
         onClick={()=>setPolygon(cropPolygon.map(p=>({x:1-p.y,y:p.x})))}>
         Rotate shape 90°</button>
       <button type="button" className="secondary-button"
         onClick={()=>setPolygon(cropPolygon.map(p=>({x:1-p.x,y:p.y})))}>
         Flip shape horizontal</button>
       <button type="button" className="secondary-button"
         onClick={()=>setPolygon(cropPolygon.map(p=>({x:p.x,y:1-p.y})))}>
         Flip shape vertical</button>
     </div>
   </section>}
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
   </details>
   <details className="crop-studio-panel"><summary>Precision &amp; alignment</summary>
   <div className="crop-actions">
     <label className="check-row"><input type="checkbox" checked={showGolden}
       onChange={e=>setGolden(e.target.checked)}/>Golden ratio</label>
     <label className="check-row"><input type="checkbox" checked={showRulers}
       onChange={e=>setRulers(e.target.checked)}/>Rulers</label>
     <label className="check-row"><input type="checkbox" checked={showSnapping}
       onChange={e=>setSnapping(e.target.checked)}/>Snap to source edges and center</label>
   </div>
   <div className="two-inputs">
     <BoundedNumberField label="Snap sensitivity (px)" min={0} max={32}
       integer value={snapSensitivity} onCommit={setSnapSensitivity}/>
     <BoundedNumberField label="Grid spacing (%)" min={2} max={50}
       integer value={gridSpacing} onCommit={setGridSpacing}/>
   </div>
   <p className="hint">Hold Alt/Option while dragging to temporarily bypass snapping. Guides are preview-only and will not print.</p>
   <div className="crop-actions">
     <label className="check-row"><input type="checkbox" checked={showGrid}
       onChange={e=>setGrid(e.target.checked)}/>Grid</label>
     <button className="secondary-button" disabled={!interactive} onClick={()=>commit(fitCropToAspect(item.crop,iw,ih,widthMm,heightMm),"reset")}>Reset</button>
     <button className="secondary-button" disabled={!interactive} onClick={()=>commit(fitCropToAspect(FULL_CROP,iw,ih,widthMm,heightMm),"fit")}>Fit</button>
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
   </details>
 </EditorWorkspace>;
}
