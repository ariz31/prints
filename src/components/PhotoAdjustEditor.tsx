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
import {parseBoundedNumber} from "../core/safeNumbers.ts";
import StudioIcon from "./StudioIcon.tsx";
import {WorkspaceEpoch} from "../core/workspaceEpoch.ts";
import {LatestRequest} from "../core/latestRequest.ts";
import {makePhotoStyle,matchingSavedPhotoStyle,readPhotoStyles,writePhotoStyles} from "../core/photoStyleLibrary.ts";
import {canCommitPhotoEdit,photoPreviewSource,photoSourceFailureMode} from "../core/photoSourceRecovery.ts";
import type {PhotoSourceMode} from "../core/photoSourceRecovery.ts";

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
 const [draft,setDraft]=useState<PhotoAdjustments>(()=>normalizeAdjustments(item.adjustments));
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
 const [preview,setPreview]=useState<{url:string;key:string}|null>(null);
 const [loadError,setLoadError]=useState("");
 const [loaded,setLoaded]=useState(false);
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
 const [zoom,setZoom]=useState(100);
 const [pan,setPan]=useState({x:0,y:0});
 const drag=useRef<{id:number,x:number,y:number,px:number,py:number}|null>(null);
 useEffect(()=>setPan({x:0,y:0}),[scope]);
 function beginPan(event:ReactPointerEvent<HTMLDivElement>){
  if(zoom<=100||localTool)return;
  drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,px:pan.x,py:pan.y};
  event.currentTarget.setPointerCapture(event.pointerId);
 }
 function movePan(event:ReactPointerEvent<HTMLDivElement>){
  const active=drag.current;
  if(!active||active.id!==event.pointerId)return;
  const bound=zoom*2;
  setPan({x:Math.max(-bound,Math.min(bound,active.px+event.clientX-active.x)),
    y:Math.max(-bound,Math.min(bound,active.py+event.clientY-active.y))});
 }
 function endPan(event:ReactPointerEvent<HTMLDivElement>){
  if(drag.current?.id===event.pointerId)drag.current=null;
 }
 const transformView="translate("+pan.x+"px,"+pan.y+"px) scale("+zoom/100+")";
 const settingsKey=JSON.stringify(draft);
 const needsRender=needsPixelProcessing(draft)||hasGeometryTransform(draft);
 const sourceIdentity=JSON.stringify([item.url,item.processedUrl??null]);
 const sourceMode=sourceFailure?.identity===sourceIdentity?sourceFailure.mode:"primary";
 const originalFallback=sourceMode==="original";
 const sourceUnavailable=sourceMode==="unavailable";
 const displayAsset=originalFallback
  ?{...item,processedUrl:undefined,processedWidth:undefined,processedHeight:undefined}
  :item;
 const src=photoPreviewSource(item,sourceMode)??item.url;
 useEffect(()=>{
  setLoaded(false);setLoadError("");setRasterFailureKey(null);
 },[sourceIdentity]);
 const draftNeutral=isNeutralAdjustment(draft);
 const selectedPhotoPreset=matchingPhotoPreset(draft);
 const savedStyle=matchingSavedPhotoStyle(draft,styles);
 const selectedPhotoLabel=PHOTO_PRESETS.find(p=>p.id===selectedPhotoPreset)?.label??savedStyle?.name;
 const original=normalizeAdjustments(item.adjustments);
 const changed=settingsKey!==JSON.stringify(original);
 const previewKey=JSON.stringify([src,item.crop,item.widthMm,item.heightMm,scope,settingsKey]);
 const rasterFailed=rasterFailureKey===previewKey;
 const sourceIsUsable=canCommitPhotoEdit(sourceMode,rasterFailed);
 useEffect(()=>setLoaded(false),[scope,src,retryToken]);
 useEffect(()=>{
  if(!needsRender||compareOriginal||sourceUnavailable||rasterFailed)return;
  let cancelled=false;
  const timer=window.setTimeout(()=>{
   void rasterizePhotoPreview(displayAsset,draft,scope).then(blob=>{
    if(cancelled)return;
    const url=URL.createObjectURL(blob);
    setPreview({url,key:previewKey});
    if(!originalFallback)setLoadError("");
   }).catch(error=>{
    if(!cancelled){
     setRasterFailureKey(previewKey);
     setLoadError("Adjusted preview failed: "+
      (error instanceof Error?error.message:"Could not render edits.")+
      " Changes cannot be applied until the image preview recovers.");
    }
   });
  },100);
  return()=>{cancelled=true;window.clearTimeout(timer);};
 },[previewKey,needsRender,compareOriginal,sourceUnavailable,rasterFailed]);
 useEffect(()=>()=>{
  if(preview)URL.revokeObjectURL(preview.url);
 },[preview]);
 const previewActive=needsRender&&!compareOriginal&&!rasterFailed&&preview?.key===previewKey;
 const filter=compareOriginal?"none":photoFilterCss(draft);
 const imageFilter=previewActive?"none":filter;
 const crop=item.crop;
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
   editEpoch.current.advance();cancelPendingEnhance();setAutoAnalysis(null);setDraft(candidate);setCompareOriginal(false);
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
 const previewSrc=previewActive?preview.url:src;
 function previewLoaded(){
  setLoaded(true);
  if(sourceMode==="primary"&&!rasterFailed)setLoadError("");
 }
 function previewFailed(url:string,generated:boolean){
  setLoaded(false);
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
  setLoadError("");setLoaded(false);setRetryToken(n=>n+1);
 }
 return <main className="photo-adjust-route" aria-label="Photo adjustments editor">
  <header className="photo-adjust-header">
   <button className="secondary-button" onClick={onCancel}
    aria-label="Cancel photo adjustments and return to workspace"><StudioIcon name="left" size={18}/> Back</button>
   <div className="photo-adjust-title">
    <h1>Edit photo</h1>
    <p title={item.name}>{item.name}</p>
   </div>
   <button className="primary-button" onClick={apply}
    disabled={!changed||compareOriginal}><StudioIcon name="apply" size={16}/>Apply changes</button>
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
    <div className={"photo-adjust-preview-stage"+(zoom>100?" photo-studio-pannable":"")}
      onPointerDown={beginPan} onPointerMove={movePan} onPointerUp={endPan}
      onPointerCancel={endPan}>
     {loadError&&<p role="alert" className="warning">{loadError}</p>}
     {scope==="full"?
      <img className="photo-adjust-full-image" src={previewSrc}
       alt={"Entire source photo: "+item.name}
       style={{filter:imageFilter,transform:transformView}}
       onLoad={()=>setLoaded(true)}
       onError={()=>setLoadError("This photo could not be displayed. Return to Images and reload its source.")}/>
      :previewActive?
      <div className={"photo-adjust-print-frame"+(localTool?" photo-studio-target":"")} onPointerDown={addLocal}
       onKeyDown={keyLocal} role={localTool?"button":undefined} tabIndex={localTool?0:undefined}
       aria-label={localTool?"Apply local "+localTool+" retouch to crop (Enter places in center)":undefined} style={{
       aspectRatio:String(item.widthMm/item.heightMm),
       "--photo-crop-ratio":item.widthMm/item.heightMm} as CSSProperties}>
       <img className="photo-adjust-preview-composed" src={previewSrc}
        alt={"Print crop preview: "+item.name} style={{width:"100%",height:"100%",objectFit:"fill",transform:transformView}}/>
       {!compareOriginal&&draft.regions?.map((region,i)=><span key={i} className="photo-studio-marker" style={{left:region.x*100+"%",top:region.y*100+"%"}} aria-hidden="true"/>)}
      </div>
      :<div className={"photo-adjust-print-frame"+(localTool?" photo-studio-target":"")} onPointerDown={addLocal}
       onKeyDown={keyLocal} role={localTool?"button":undefined} tabIndex={localTool?0:undefined}
       aria-label={localTool?"Apply local "+localTool+" retouch to crop (Enter places in center)":undefined} style={{
       aspectRatio:String(item.widthMm/item.heightMm),
       "--photo-crop-ratio":item.widthMm/item.heightMm} as CSSProperties}>
       <img src={src} alt={"Print crop preview: "+item.name}
        style={{...croppedStyle,transform:transformView}} onLoad={()=>setLoaded(true)}
        onError={()=>setLoadError("This photo could not be displayed.")}/>
       {!compareOriginal&&draft.regions?.map((region,i)=><span key={i} className="photo-studio-marker" style={{left:region.x*100+"%",top:region.y*100+"%"}} aria-hidden="true"/>)}
      </div>}
    </div>
    <div className="photo-adjust-preview-foot">
     <span>{scope==="full"?(hasGeometryTransform(draft)?"Full photo · centered orientation":"Full photo · no cropping"):"Exact print framing"}
      {scope==="full"&&!!draft.regions?.length?" · Retouches shown in Print crop":""}</span>
     <span>{compareOriginal?"Original, unadjusted":draftNeutral?"Unadjusted":"Live adjustments"}
      {!loaded?" · Loading…":""}</span>
    </div>
    <label className="photo-studio-zoom">Preview zoom: {zoom}%
     <input aria-label="Preview zoom" type="range" min="100" max="250" step="10"
      disabled={!!localTool} value={zoom} onChange={e=>{const next=Number(e.target.value);setZoom(next);if(next===100)setPan({x:0,y:0});}}/>
    </label>
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
     <button className="secondary-button" disabled={autoBusy} onClick={()=>void autoEnhance()}>
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
        onClick={()=>{setLocalTool(localTool===mode?null:mode);setScope("crop");setZoom(100);}}>
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
      <input aria-label="Replacement background color" type="color"
       value={draft.backgroundColor??"#ffffff"}
       onChange={e=>transform({backgroundColor:e.target.value})}/>
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
      disabled={!changed||compareOriginal}>Apply changes</button>
     {onApplyAll&&<button className="secondary-button" onClick={applyAll}
      disabled={compareOriginal}>Apply global adjustments to all images</button>}
    </div>
    <p className="hint">Screen colors are not ICC printer proofing. Verify color and crop with a physical test print; exported PNG/PDF uses the same image operations.</p>
   </section>
  </div>
 </main>;
}
