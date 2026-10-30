import {useEffect,useMemo,useRef,useState} from "react";
import type {CSSProperties,KeyboardEvent as ReactKeyboardEvent,PointerEvent as ReactPointerEvent} from "react";
import type {PhotoAsset} from "../core/exportPdf.ts";
import {
 DEFAULT_ADJUSTMENTS,PHOTO_CONTROLS,PHOTO_PRESETS,autoEnhanceFromImage,
 blendAutoEnhancement,globalPhotoAdjustments,mergeGlobalPhotoAdjustments,PHOTO_EDIT_SCHEMA_VERSION,
 hasGeometryTransform,isNeutralAdjustment,needsPixelProcessing,
 matchingPhotoPreset,normalizeAdjustments,photoFilterCss,validPhotoAdjustments,
} from "../core/photoAdjustments.ts";
import type {PhotoAdjustments,PhotoControl} from "../core/photoAdjustments.ts";
import {rasterizePhotoPreview} from "../core/imageRaster.ts";
import {PhotoPreviewRenderer} from "../core/photoPreviewRenderer.ts";
import {parseBoundedNumber} from "../core/safeNumbers.ts";
import StudioIcon from "./StudioIcon.tsx";
import {WorkspaceEpoch} from "../core/workspaceEpoch.ts";
import {LatestRequest} from "../core/latestRequest.ts";
import {makePhotoStyle,matchingSavedPhotoStyle,readPhotoStyles,writePhotoStyles} from "../core/photoStyleLibrary.ts";
import {canCommitPhotoEdit,photoPreviewSource,photoSourceFailureMode,photoPreviewAsset} from "../core/photoSourceRecovery.ts";
import type {PhotoSourceMode} from "../core/photoSourceRecovery.ts";
import {
 INITIAL_PREVIEW_VIEW,panPreviewView,pinchPreviewView,zoomPreviewView,
} from "../core/photoViewport.ts";
import type {PreviewView,ViewPoint,ViewSize} from "../core/photoViewport.ts";

import {useEditorHistory} from "./useEditorHistory.ts";
import {editorShortcut} from "./EditorWorkspace.tsx";
import InlineColorField from "./InlineColorField.tsx";
interface Props {
 item:PhotoAsset;
 onApply:(adjustments:PhotoAdjustments|undefined)=>void;
 onApplyAll?:(adjustments:PhotoAdjustments|undefined)=>void;
 onCancel:()=>void;
 onRestoreOriginal?:()=>void;
}
type Category="Light"|"Color"|"Detail"|"Tools";
const CATEGORIES:Category[]=["Light","Color","Detail","Tools"];

async function analyzePhoto(url:string):Promise<PhotoAdjustments>{
 const image=new Image();
 await new Promise<void>((resolve,reject)=>{
  image.onload=()=>resolve();
  image.onerror=()=>reject(new Error("Cannot analyze this image."));
  image.src=url;
 });
 const canvas=document.createElement("canvas");
 canvas.width=96;canvas.height=96;
 const ctx=canvas.getContext("2d",{willReadFrequently:true});
 if(!ctx)throw new Error("Auto Enhance is unavailable on this device.");
 ctx.drawImage(image,0,0,96,96);
 return autoEnhanceFromImage(ctx.getImageData(0,0,96,96));
}
/**
 * Image Studio: draft edits remain private until Apply, source bytes are immutable.
 * Advanced previews and exports run the identical local pixel pipeline.
 * Legacy brightness/contrast/saturation retain their original CSS presentation.
 */
export default function PhotoAdjustEditor({item,onApply,onApplyAll,onCancel,onRestoreOriginal}:Props){
 const history=useEditorHistory<PhotoAdjustments>(()=>normalizeAdjustments(item.adjustments));
 const draft=history.value,setDraft=history.set;
 const editEpoch=useRef(new WorkspaceEpoch());
 const enhanceRequest=useRef(new LatestRequest());
 const mounted=useRef(false);
 useEffect(()=>{mounted.current=true;return()=>{
   mounted.current=false;editEpoch.current.advance();enhanceRequest.current.cancel();
 };},[]);
 function cancelPendingEnhance(){enhanceRequest.current.cancel();setAutoBusy(false);}
 const [category,setCategory]=useState<Category>("Light");
 const [compareOriginal,setCompareOriginal]=useState(false);
 const [scope,setScope]=useState<"full"|"crop">("full");
 const [preview,setPreview]=useState<{url:string;key:string;sourceKey:string;quality:"interactive"|"final"}|null>(null);
 const previewRenderer=useRef<PhotoPreviewRenderer|null>(null);
 useEffect(()=>{
  const renderer=new PhotoPreviewRenderer();previewRenderer.current=renderer;
  return()=>{renderer.dispose();if(previewRenderer.current===renderer)previewRenderer.current=null;};
 },[]);
 const [loadError,setLoadError]=useState("");
 const [loadedImageKey,setLoadedImageKey]=useState("");
 const [sourceFailure,setSourceFailure]=useState<{identity:string;mode:PhotoSourceMode}|null>(null);
 const [rasterFailureKey,setRasterFailureKey]=useState<string|null>(null);
 const [retryToken,setRetryToken]=useState(0);
 const [autoBusy,setAutoBusy]=useState(false);
 const [autoAnalysis,setAutoAnalysis]=useState<PhotoAdjustments|null>(null);
 const [enhanceStrength,setEnhanceStrength]=useState(100);
 const [styles,setStyles]=useState(readPhotoStyles);
 const [styleName,setStyleName]=useState("");
 const [localTool,setLocalTool]=useState<"light"|"heal"|"red-eye"|null>(null);
 const [brushRadius,setBrushRadius]=useState(8);
 const [brushStrength,setBrushStrength]=useState(75);
 // The viewport is presentation-only: it never changes source pixels or crop.
 const [view,setView]=useState<PreviewView>(INITIAL_PREVIEW_VIEW);
 const viewRef=useRef<PreviewView>(INITIAL_PREVIEW_VIEW);
 const pointers=useRef(new Map<number,ViewPoint>());
 const stageRef=useRef<HTMLDivElement>(null);
 function commitView(next:PreviewView){
  viewRef.current=next;
  setView(next);
 }
 function stageGeometry():{stage:ViewSize;content:ViewSize}{
  const stageNode=stageRef.current;
  if(!stageNode)return {stage:{width:0,height:0},content:{width:0,height:0}};
  const stage={width:stageNode.clientWidth,height:stageNode.clientHeight};
  const frame=stageNode.querySelector<HTMLElement>(".photo-adjust-print-frame");
  if(frame)return {stage,content:{width:frame.offsetWidth,height:frame.offsetHeight}};
  const img=stageNode.querySelector<HTMLImageElement>("img");
  const w=img?.clientWidth??0,h=img?.clientHeight??0;
  const iw=img?.naturalWidth||item.processedWidth||item.pixelWidth;
  const ih=img?.naturalHeight||item.processedHeight||item.pixelHeight;
  const ratio=iw>0&&ih>0?iw/ih:1;
  const width=Math.min(w,h*ratio);
  return {stage,content:{width,height:ratio>0?width/ratio:0}};
 }
 useEffect(()=>{
  // Switching from full photo to crop must not reuse unrelated pan offsets.
  pointers.current.clear();
  const geometry=stageGeometry();
  commitView(zoomPreviewView({...viewRef.current,x:0,y:0},viewRef.current.scale,
   geometry.stage,geometry.content));
 },[scope]);
 function beginPan(event:ReactPointerEvent<HTMLDivElement>){
  if(localTool||!loaded||(event.pointerType==="mouse"&&event.button!==0)||pointers.current.size>=2)return;
  if((event.target as HTMLElement).closest("button,input,a"))return;
  try {event.currentTarget.setPointerCapture(event.pointerId);}
  catch {return;}
  const rect=event.currentTarget.getBoundingClientRect();
  pointers.current.set(event.pointerId,{x:event.clientX-rect.left,y:event.clientY-rect.top});
 }
 function movePan(event:ReactPointerEvent<HTMLDivElement>){
  const previous=pointers.current.get(event.pointerId);
  if(!previous)return;
  const before=[...pointers.current.values()];
  const rect=event.currentTarget.getBoundingClientRect();
  pointers.current.set(event.pointerId,{x:event.clientX-rect.left,y:event.clientY-rect.top});
  const after=[...pointers.current.values()];
  const {stage,content}=stageGeometry();
  if(before.length===2&&after.length===2){
   commitView(pinchPreviewView(viewRef.current,
    [before[0],before[1]],[after[0],after[1]],stage,content));
  }else if(before.length===1&&viewRef.current.scale>1){
   commitView(panPreviewView(viewRef.current,event.clientX-rect.left-previous.x,
    event.clientY-rect.top-previous.y,stage,content));
  }
 }
 function endPan(event:ReactPointerEvent<HTMLDivElement>){
  pointers.current.delete(event.pointerId);
 }
 useEffect(()=>{
  const node=stageRef.current;if(!node)return;
  const observer=new ResizeObserver(()=>{
   pointers.current.clear();const g=stageGeometry();
   commitView(zoomPreviewView(viewRef.current,viewRef.current.scale,g.stage,g.content));
  });
  observer.observe(node);return()=>observer.disconnect();
 },[]);
 function changeZoom(percent:number){
  const {stage,content}=stageGeometry();
  commitView(zoomPreviewView(viewRef.current,percent/100,stage,content));
 }
 const transformView="translate("+view.x+"px,"+view.y+"px) scale("+view.scale+")";
 const settingsKey=JSON.stringify(draft);
 const needsRender=needsPixelProcessing(draft)||hasGeometryTransform(draft);
 const sourceIdentity=JSON.stringify([item.url,item.processedUrl??null]);
 const sourceMode=sourceFailure?.identity===sourceIdentity?sourceFailure.mode:"primary";
 const originalFallback=sourceMode==="original";
 const sourceUnavailable=sourceMode==="unavailable";
 const displayAsset=photoPreviewAsset(item,sourceMode);
 const src=photoPreviewSource(item,sourceMode)??item.url;
 useEffect(()=>{
  // This editor may stay mounted when the same design receives a restored or
  // replaced processed source. Never let an earlier analysis overwrite it.
  editEpoch.current.advance();
  enhanceRequest.current.cancel();
  setAutoBusy(false);
  setAutoAnalysis(null);
  setEnhanceStrength(100);
  history.reset(normalizeAdjustments(item.adjustments));
  setPreview(null);
  pointers.current.clear();commitView(INITIAL_PREVIEW_VIEW);
  setLoadedImageKey("");setLoadError("");setRasterFailureKey(null);
 },[sourceIdentity]);
 const draftNeutral=isNeutralAdjustment(draft);
 const selectedPhotoPreset=matchingPhotoPreset(draft);
 const savedStyle=matchingSavedPhotoStyle(draft,styles);
 const selectedPhotoLabel=PHOTO_PRESETS.find(p=>p.id===selectedPhotoPreset)?.label??savedStyle?.name;
 const original=normalizeAdjustments(item.adjustments);
 const changed=settingsKey!==JSON.stringify(original);
 const previewSourceKey=JSON.stringify([src,displayAsset.crop,item.widthMm,item.heightMm,scope]);
 const previewKey=JSON.stringify([previewSourceKey,settingsKey]);
 const rasterFailed=rasterFailureKey===previewKey;

 useEffect(()=>{
  if(!needsRender||compareOriginal||sourceUnavailable||rasterFailed)return;
  let cancelled=false;
  const renderer=previewRenderer.current;
  const run=(quality:"interactive"|"final")=>{
   const job=renderer?.render(displayAsset,draft,scope,quality) ??
    rasterizePhotoPreview(displayAsset,draft,scope);
   void job.then(blob=>{
    if(cancelled)return;
    const url=URL.createObjectURL(blob);
    setPreview({url,key:previewKey,sourceKey:previewSourceKey,quality});
    if(!originalFallback)setLoadError("");
   }).catch(error=>{
    if(!cancelled){
     setRasterFailureKey(previewKey);
     setLoadError("Adjusted preview failed: "+
      (error instanceof Error?error.message:"Could not render edits.")+
      " Changes cannot be applied until the image preview recovers.");
    }
   });
  };
  if(renderer?.usesWorker)run("interactive");
  const timer=window.setTimeout(()=>run("final"),renderer?.usesWorker?220:100);
  return()=>{cancelled=true;window.clearTimeout(timer);};
 },[previewKey,needsRender,compareOriginal,sourceUnavailable,rasterFailed]);
 useEffect(()=>()=>{
  if(preview)URL.revokeObjectURL(preview.url);
 },[preview]);
 const previewReusable=needsRender&&!compareOriginal&&!rasterFailed&&preview?.sourceKey===previewSourceKey;
 const previewActive=previewReusable&&preview?.key===previewKey&&preview.quality==="final";
 const previewSrc=previewReusable?preview.url:src;
 // An earlier decoded image does not authorize edits to a newly selected image,
 // zoom/crop mode or regenerated preview URL.
 const visibleImageKey=JSON.stringify([scope,previewSrc,retryToken]);
 const loaded=loadedImageKey===visibleImageKey;
 // Advanced edits must be rendered *and decoded* before Apply can export them.
 // Otherwise the displayed source could differ from the printed result.
 const sourceIsUsable=canCommitPhotoEdit(sourceMode,rasterFailed,loaded)&&
  (!needsRender||previewActive);
 const filter=compareOriginal?"none":photoFilterCss(draft);
 const imageFilter=previewReusable?"none":filter;
 const crop=displayAsset.crop;
 const croppedStyle:CSSProperties={
  width:(100/crop.width)+"%",height:(100/crop.height)+"%",
  left:(-100*crop.x/crop.width)+"%",top:(-100*crop.y/crop.height)+"%",
  filter:imageFilter,
 };
 const controls=useMemo(()=>(Object.keys(PHOTO_CONTROLS) as PhotoControl[])
   .filter(key=>PHOTO_CONTROLS[key].category===category),[category]);
 function setValue(key:PhotoControl,value:number){
  const candidate={...draft,[key]:value};
  if(validPhotoAdjustments(candidate)){
   editEpoch.current.advance();cancelPendingEnhance();setAutoAnalysis(null);history.change(candidate,key);setCompareOriginal(false);
  }
 }
 function apply(){
  if(!sourceIsUsable)return;
  onApply(draftNeutral?undefined:{...draft,schemaVersion:PHOTO_EDIT_SCHEMA_VERSION});
 }
 function applyAll(){
  if(!onApplyAll||!sourceIsUsable)return;
  const reusable=globalPhotoAdjustments(draft);
  const checked=window.confirm("Apply the current global photo adjustments to every image? Each photo keeps its individual crop and retouch regions. Review each image before printing.");
  if(checked)onApplyAll(isNeutralAdjustment(reusable)?undefined:reusable);
 }
 function insertLocal(x:number,y:number){
  if(!localTool||compareOriginal||scope!=="crop")return;
  if((draft.regions?.length??0)>=20){setLoadError("Maximum 20 retouch points per photo.");return;}
  transform({regions:[...(draft.regions??[]),{
   kind:localTool,x,y,radius:brushRadius/100,strength:brushStrength,
  }]});
 }
 function addLocal(event:ReactPointerEvent<HTMLDivElement>){
  if(!localTool)return;
  const rect=event.currentTarget.getBoundingClientRect();
  if(rect.width<1||rect.height<1)return;
  const x=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));
  const y=Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height));
  insertLocal(x,y);
 }
 function keyLocal(event:ReactKeyboardEvent<HTMLDivElement>){
  if(localTool&&(event.key==="Enter"||event.key===" ")){
   event.preventDefault();insertLocal(.5,.5);
  }
 }
 async function autoEnhance(){
  if(!sourceIsUsable)return;
  const requested=editEpoch.current.capture();
  const operation=enhanceRequest.current.begin();
  setAutoBusy(true);
  try{
   const auto=await analyzePhoto(src);
   // A stale analysis must not overwrite a manual edit or a newer analysis.
   if(!mounted.current || !enhanceRequest.current.isCurrent(operation) ||
       !editEpoch.current.current(requested))return;
   editEpoch.current.advance();
   setAutoAnalysis(auto);
   setEnhanceStrength(100);
   setDraft(blendAutoEnhancement(auto,100));
   setCompareOriginal(false);setCategory("Light");setLoadError("");
  }catch(cause){
   if(mounted.current && enhanceRequest.current.isCurrent(operation) &&
      editEpoch.current.current(requested))
    setLoadError(cause instanceof Error?cause.message:"Auto Enhance is unavailable.");
  }finally{
   if(mounted.current && enhanceRequest.current.isCurrent(operation))
    setAutoBusy(false);
  }
 }
 function transform(patch:Partial<PhotoAdjustments>){
  const next={...draft,...patch};
  if(validPhotoAdjustments(next)){
   editEpoch.current.advance();cancelPendingEnhance();setAutoAnalysis(null);setDraft(next);setCompareOriginal(false);
  }
 }
 function previewLoaded(){
  setLoadedImageKey(visibleImageKey);
  if(sourceMode==="primary"&&!rasterFailed)setLoadError("");
 }
 function previewFailed(url:string,generated:boolean){
  setLoadedImageKey("");
  if(generated){
   setRasterFailureKey(previewKey);
   setLoadError("Adjusted preview could not be displayed. Retry image before applying changes.");
   return;
  }
  const mode=photoSourceFailureMode(item,url,sourceMode);
  setSourceFailure({identity:sourceIdentity,mode});
  setLoadError(mode==="original"
   ?"The processed photo could not be loaded. Showing the original only. Restore the original to repair this print design."
   :"This photo could not be loaded. Retry image, reopen a saved project or reimport the original file.");
 }
 function retryImage(){
  setSourceFailure(null);setRasterFailureKey(null);
  setLoadError("");setLoadedImageKey("");setRetryToken(n=>n+1);
 }
 const undo=()=>{editEpoch.current.advance();cancelPendingEnhance();setAutoAnalysis(null);setCompareOriginal(false);history.undo();};
 const redo=()=>{editEpoch.current.advance();cancelPendingEnhance();setAutoAnalysis(null);setCompareOriginal(false);history.redo();};
 return <main className="photo-adjust-route" aria-label="Photo adjustments editor" onKeyDown={e=>editorShortcut(e,undo,redo)}>
  <header className="photo-adjust-header">
   <button className="secondary-button" onClick={onCancel}
    aria-label="Cancel photo adjustments and return to workspace"><StudioIcon name="left" size={18}/> Cancel</button>
   <div className="photo-adjust-title">
    <h1>Edit photo</h1>
    <p title={item.name}>{item.name}</p>
   </div>
   <div className="editor-header-actions"><div className="editor-history" role="group" aria-label="Editor undo and redo">
    <button className="icon-button" aria-label="Undo edit" onClick={undo} disabled={!history.canUndo}><StudioIcon name="undo" size={18}/></button>
    <button className="icon-button" aria-label="Redo edit" onClick={redo} disabled={!history.canRedo}><StudioIcon name="redo" size={18}/></button>
   </div>
   <button className="primary-button" onClick={apply}
    disabled={!changed||compareOriginal||!sourceIsUsable}><StudioIcon name="apply" size={16}/>Apply changes</button>
   </div>
  </header>
  <div className="photo-adjust-layout">
   <section className="photo-adjust-preview" aria-label="Entire photo editing preview">
    <div className="photo-adjust-preview-top">
     <div className="photo-adjust-view-switch" role="group" aria-label="Preview area">
      <button className={scope==="full"?"active":""}
       aria-pressed={scope==="full"} onClick={()=>setScope("full")}>Entire photo</button>
      <button className={scope==="crop"?"active":""}
       aria-pressed={scope==="crop"} onClick={()=>setScope("crop")}>Print crop</button>
     </div>
     <button className="secondary-button" aria-pressed={compareOriginal}
      onClick={()=>setCompareOriginal(v=>!v)}>
      {compareOriginal?"Viewing original":"Compare original"}
     </button>
    </div>
    <div ref={stageRef} className={"photo-adjust-preview-stage"+(view.scale>1?" photo-studio-pannable":"")}
      role="group" aria-label="Image preview: pinch to zoom; drag to pan when zoomed"
      onPointerDown={beginPan} onPointerMove={movePan} onPointerUp={endPan}
      onPointerCancel={endPan} onLostPointerCapture={endPan}>
     {loadError&&<p role="alert" className="warning">{loadError}</p>}
     {(sourceUnavailable||rasterFailed||originalFallback)&&<div className="photo-adjust-recovery">
      <button className="secondary-button" type="button" onClick={retryImage}>Retry image</button>
      {originalFallback&&loaded&&onRestoreOriginal&&
       <button className="secondary-button" type="button" onClick={onRestoreOriginal}>
        Restore original for this design</button>}
     </div>}
     {sourceUnavailable?null:scope==="full"?
      <img key={previewSrc+":"+retryToken} className="photo-adjust-full-image" draggable={false} src={previewSrc}
       alt={"Entire source photo: "+item.name}
       style={{filter:imageFilter,transform:transformView}}
       onLoad={previewLoaded}
       onError={()=>previewFailed(previewSrc,previewActive)}/>
      :previewReusable?
      <div className={"photo-adjust-print-frame"+(localTool?" photo-studio-target":"")} onPointerDown={addLocal}
       onKeyDown={keyLocal} role={localTool?"button":undefined} tabIndex={localTool?0:undefined}
       aria-label={localTool?"Apply local "+localTool+" retouch to crop (Enter places in center)":undefined} style={{
       aspectRatio:String(item.widthMm/item.heightMm),
       "--photo-crop-ratio":item.widthMm/item.heightMm,transform:transformView} as CSSProperties}>
       <img key={previewSrc+":"+retryToken} className="photo-adjust-preview-composed" draggable={false} src={previewSrc}
        alt={"Print crop preview: "+item.name} style={{width:"100%",height:"100%",objectFit:"fill"}}
        onLoad={previewLoaded} onError={()=>previewFailed(previewSrc,true)}/>
       {!compareOriginal&&draft.regions?.map((region,i)=><span key={i} className="photo-studio-marker" style={{left:region.x*100+"%",top:region.y*100+"%"}} aria-hidden="true"/>)}
      </div>
      :<div className={"photo-adjust-print-frame"+(localTool?" photo-studio-target":"")} onPointerDown={addLocal}
       onKeyDown={keyLocal} role={localTool?"button":undefined} tabIndex={localTool?0:undefined}
       aria-label={localTool?"Apply local "+localTool+" retouch to crop (Enter places in center)":undefined} style={{
       aspectRatio:String(item.widthMm/item.heightMm),
       "--photo-crop-ratio":item.widthMm/item.heightMm,transform:transformView} as CSSProperties}>
       <img key={src+":"+retryToken} src={src} draggable={false} alt={"Print crop preview: "+item.name}
        style={croppedStyle} onLoad={previewLoaded}
        onError={()=>previewFailed(src,false)}/>
       {!compareOriginal&&draft.regions?.map((region,i)=><span key={i} className="photo-studio-marker" style={{left:region.x*100+"%",top:region.y*100+"%"}} aria-hidden="true"/>)}
      </div>}
    </div>
    <div className="photo-adjust-preview-foot">
     <span>{scope==="full"?(hasGeometryTransform(draft)?"Full photo · centered orientation":"Full photo · no cropping"):"Exact print framing"}
      {scope==="full"&&!!draft.regions?.length?" · Retouches shown in Print crop":""}</span>
     <span>{compareOriginal?"Original, unadjusted":draftNeutral?"Unadjusted":"Live adjustments"}
      {sourceUnavailable?" · Image unavailable":originalFallback?" · Original fallback":rasterFailed?" · Preview unavailable":needsRender&&!compareOriginal&&!previewActive&&previewReusable?" · Refining preview…":!loaded?" · Loading…":""}</span>
    </div>
    <div className="photo-viewport-tools"><button className="secondary-button" onClick={()=>changeZoom(100)}>Fit</button>
    <label className="photo-studio-zoom">Preview zoom: {Math.round(view.scale*100)}%
     <input aria-label="Preview zoom" type="range" min="100" max="250" step="1"
      disabled={!!localTool} value={Math.round(view.scale*100)} onChange={e=>changeZoom(Number(e.target.value))}/>
    </label></div>
   </section>
   <section className="photo-adjust-controls" aria-label="Photo tone controls" role="region" tabIndex={0}>
    <h2>Photo Studio</h2>
    <p>All edits stay on this device and are applied non-destructively.</p>
    <div className="photo-studio-presets" role="group" aria-label="Photo style presets">
     {PHOTO_PRESETS.map(p=><button className="secondary-button" key={p.id}
      type="button" aria-pressed={selectedPhotoPreset===p.id}
      onClick={()=>{editEpoch.current.advance();cancelPendingEnhance();setAutoAnalysis(null);setDraft(mergeGlobalPhotoAdjustments(draft,p.value));setCompareOriginal(false);}}>
      {p.label}</button>)}
    </div>
    <details className="advanced-options photo-studio-saved-styles">
     <summary>My saved photo styles ({styles.length}/12)</summary>
     <div className="photo-studio-saved-fields">
      <label>Style name
       <input aria-label="Photo style name" maxLength={50} value={styleName}
        onChange={e=>setStyleName(e.target.value)} placeholder="e.g. ID portrait"/>
      </label>
      <button className="secondary-button" type="button"
       disabled={!styleName.trim()||styles.length>=12}
       onClick={()=>{
        try{
         const next=[...styles,makePhotoStyle(crypto.randomUUID(),styleName,draft)];
         writePhotoStyles(next);setStyles(next);setStyleName("");setLoadError("");
        }catch(e){setLoadError(e instanceof Error?e.message:"Could not save style.");}
       }}>Save current style</button>
      <label>Saved styles
       <select aria-label="Apply saved photo style" value={savedStyle?.id??""}
        onChange={e=>{
         const chosen=styles.find(style=>style.id===e.target.value);
         if(!chosen)return;
         editEpoch.current.advance();cancelPendingEnhance();setAutoAnalysis(null);
         setDraft(mergeGlobalPhotoAdjustments(draft,chosen.adjustments));setCompareOriginal(false);
        }}>
        <option value="">Custom / no saved style</option>
        {styles.map(style=><option key={style.id} value={style.id}>{style.name}</option>)}
       </select>
      </label>
      <button className="secondary-button" disabled={!savedStyle} type="button"
       onClick={()=>{
        if(!savedStyle||!window.confirm("Delete saved photo style "+savedStyle.name+"?"))return;
        try{const next=styles.filter(v=>v.id!==savedStyle.id);
         writePhotoStyles(next);setStyles(next);setLoadError("");
        }catch(e){setLoadError(e instanceof Error?e.message:"Could not delete style.");}
       }}>Delete matching saved style</button>
      <p className="hint">Styles save global tone/detail only. Crops, retouches, background replacements and orientation remain photo-specific.</p>
     </div>
    </details>
    <p className="hint" role="status">{selectedPhotoLabel?"Selected style: "+selectedPhotoLabel:"Custom photo adjustments"}</p>
    <div className="photo-studio-auto">
     <button className="secondary-button" disabled={autoBusy||!sourceIsUsable} onClick={()=>void autoEnhance()}>
      <StudioIcon name="edit" size={16}/>{autoBusy?"Analyzing…":"Auto Enhance"}</button>
    </div>
    {autoAnalysis&&<div className="photo-studio-auto-strength">
     <label htmlFor="auto-enhance-strength">Auto Enhance strength: {enhanceStrength}%</label>
     <input id="auto-enhance-strength" aria-label="Auto Enhance strength" type="range"
      min="0" max="100" step="1" value={enhanceStrength} onChange={event=>{
       const strength=parseBoundedNumber(event.target.value,0,100,true);
       if(strength===null)return;
       editEpoch.current.advance();setEnhanceStrength(strength);
       setDraft(blendAutoEnhancement(autoAnalysis,strength));setCompareOriginal(false);
      }}/>
     <button className="secondary-button" type="button" onClick={()=>{
      editEpoch.current.advance();setAutoAnalysis(null);setEnhanceStrength(100);
      setDraft({...DEFAULT_ADJUSTMENTS});setCompareOriginal(false);
     }}>Reset Auto Enhance</button>
    </div>}
    <div className="photo-studio-tabs" role="group" aria-label="Adjustment categories">
     {CATEGORIES.map(name=><button key={name} type="button" className={category===name?"active":""}
      aria-pressed={category===name} onClick={()=>setCategory(name)}>{name}</button>)}
    </div>
    {controls.map(key=>{
     const config=PHOTO_CONTROLS[key],value=draft[key]??0;
     return <div className="photo-adjust-control" key={key}>
      <div className="photo-adjust-control-heading">
       <label htmlFor={"photo-adjust-"+key}>{config.label}</label>
       <output htmlFor={"photo-adjust-"+key}>{value>0?"+":""}{value}</output>
       <button className="photo-studio-reset" aria-label={"Reset "+config.label}
        disabled={value===0} onClick={()=>setValue(key,0)}><StudioIcon name="reset" size={14}/></button>
      </div>
      <input id={"photo-adjust-"+key} type="range" min={config.min} max={config.max}
       step={1} value={value} onChange={e=>{
        const number=parseBoundedNumber(e.target.value,config.min,config.max,true);
        if(number!==null)setValue(key,number);
       }}/>
     </div>;
    })}
    {category==="Tools"&&<div className="photo-studio-orientation">
     <h3>Local retouch · Print crop</h3>
     <p className="hint">Choose a brush, switch to Print crop, then tap where you want the effect. Blemish correction copies a neighboring clean patch; inspect each result closely.</p>
     <div className="photo-studio-presets" role="group" aria-label="Local retouch brush">
      {(["light","heal","red-eye"] as const).map(mode=>
       <button key={mode} className="secondary-button" aria-pressed={localTool===mode}
        onClick={()=>{setLocalTool(localTool===mode?null:mode);setScope("crop");commitView(INITIAL_PREVIEW_VIEW);pointers.current.clear();}}>
        {mode==="light"?"Dodge / brighten":mode==="heal"?"Blemish spot":"Red-eye"}</button>)}
     </div>
     <label className="photo-studio-brush">Brush radius: {brushRadius}%
      <input type="range" min="2" max="20" value={brushRadius}
       onChange={e=>setBrushRadius(Number(e.target.value))}/>
     </label>
     <label className="photo-studio-brush">Brush strength: {brushStrength}%
      <input type="range" min="10" max="100" value={brushStrength}
       onChange={e=>setBrushStrength(Number(e.target.value))}/>
     </label>
     <div className="photo-studio-presets">
      <button className="secondary-button" disabled={!draft.regions?.length}
       onClick={()=>transform({regions:draft.regions?.slice(0,-1)})}>Undo spot</button>
      <button className="secondary-button" disabled={!draft.regions?.length}
       onClick={()=>transform({regions:[]})}>Clear retouches</button>
     </div>
     <h3>Background replacement</h3>
     <p className="hint">Fill transparent pixels with a solid background color. Use Background cleanup first to make the backdrop transparent.</p>
     <div className="photo-studio-background">
      <InlineColorField label="Replacement background color" value={draft.backgroundColor??"#ffffff"}
       onChange={color=>transform({backgroundColor:color})}/>
      <button className="secondary-button"
       onClick={()=>transform({backgroundColor:draft.backgroundColor?undefined:"#ffffff"})}>
       {draft.backgroundColor?"Restore transparency":"Use solid background"}</button>
     </div>
     <h3>Photo orientation</h3>
     <label className="photo-studio-brush" htmlFor="photo-fine-straighten">
      Fine straighten: {draft.straighten??0}°
      <input id="photo-fine-straighten" type="range" min="-15" max="15" step="1"
       value={draft.straighten??0}
       onChange={e=>transform({straighten:Number(e.target.value)})}/>
     </label>
     <div className="photo-studio-presets">
      <button className="secondary-button" onClick={()=>transform({rotation:((draft.rotation??0)+90)%360})}>Rotate 90°</button>
      <button className="secondary-button" aria-pressed={!!draft.flipX} onClick={()=>transform({flipX:!draft.flipX})}>Flip horizontal</button>
      <button className="secondary-button" aria-pressed={!!draft.flipY} onClick={()=>transform({flipY:!draft.flipY})}>Flip vertical</button>
     </div>
     <p className="hint">Rotation uses centered cover framing within the existing print crop. Inspect the exact crop before printing.</p>
    </div>}
    <div className="photo-adjust-actions">
     <button className="secondary-button" onClick={()=>{editEpoch.current.advance();cancelPendingEnhance();setAutoAnalysis(null);setEnhanceStrength(100);setDraft({...DEFAULT_ADJUSTMENTS});setCompareOriginal(false);}}
      disabled={draftNeutral}>Reset adjustments</button>
     <button className="primary-button" onClick={apply}
      disabled={!changed||compareOriginal||!sourceIsUsable}>Apply changes</button>
     {onApplyAll&&<button className="secondary-button" onClick={applyAll}
      disabled={compareOriginal||!sourceIsUsable}>Apply global adjustments to all images</button>}
    </div>
    <p className="hint">Screen colors are not ICC printer proofing. Verify color and crop with a physical test print; exported PNG/PDF uses the same image operations.</p>
   </section>
  </div>
 </main>;
}
