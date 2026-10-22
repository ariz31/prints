import {useEffect,useMemo,useState} from "react";
import type {CSSProperties,PointerEvent as ReactPointerEvent} from "react";
import type {PhotoAsset} from "../core/exportPdf.ts";
import {
 DEFAULT_ADJUSTMENTS,PHOTO_CONTROLS,PHOTO_PRESETS,autoEnhanceFromImage,
 hasGeometryTransform,isNeutralAdjustment,needsPixelProcessing,
 normalizeAdjustments,photoFilterCss,validPhotoAdjustments,
} from "../core/photoAdjustments.ts";
import type {PhotoAdjustments,PhotoControl} from "../core/photoAdjustments.ts";
import {rasterizePhotoPreview} from "../core/imageRaster.ts";
import {parseBoundedNumber} from "../core/safeNumbers.ts";
import StudioIcon from "./StudioIcon.tsx";

interface Props {
 item:PhotoAsset;
 onApply:(adjustments:PhotoAdjustments|undefined)=>void;
 onApplyAll?:(adjustments:PhotoAdjustments|undefined)=>void;
 onCancel:()=>void;
}
type Category="Light"|"Color"|"Detail"|"Tools";
const CATEGORIES:Category[]=["Light","Color","Detail","Tools"];
const sourceURL=(item:PhotoAsset)=>item.processedUrl??item.url;

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
export default function PhotoAdjustEditor({item,onApply,onApplyAll,onCancel}:Props){
 const [draft,setDraft]=useState<PhotoAdjustments>(()=>normalizeAdjustments(item.adjustments));
 const [category,setCategory]=useState<Category>("Light");
 const [compareOriginal,setCompareOriginal]=useState(false);
 const [scope,setScope]=useState<"full"|"crop">("full");
 const [preview,setPreview]=useState<{url:string;key:string}|null>(null);
 const [loadError,setLoadError]=useState("");
 const [loaded,setLoaded]=useState(false);
 const [autoBusy,setAutoBusy]=useState(false);
 const [localTool,setLocalTool]=useState<"light"|"heal"|"red-eye"|null>(null);
 const [brushRadius,setBrushRadius]=useState(8);
 const [brushStrength,setBrushStrength]=useState(75);
 const [zoom,setZoom]=useState(100);
 const settingsKey=JSON.stringify(draft);
 const needsRender=needsPixelProcessing(draft)||hasGeometryTransform(draft);
 const src=sourceURL(item);
 const draftNeutral=isNeutralAdjustment(draft);
 const original=normalizeAdjustments(item.adjustments);
 const changed=settingsKey!==JSON.stringify(original);
 const previewKey=JSON.stringify([src,item.crop,item.widthMm,item.heightMm,scope,settingsKey]);
 useEffect(()=>{
  if(!needsRender||compareOriginal)return;
  let cancelled=false;
  const timer=window.setTimeout(()=>{
   void rasterizePhotoPreview(item,draft,scope).then(blob=>{
    if(cancelled)return;
    const url=URL.createObjectURL(blob);
    setPreview({url,key:previewKey});
    setLoadError("");
   }).catch(error=>{
    if(!cancelled)setLoadError(error instanceof Error?error.message:"Could not preview edits.");
   });
  },100);
  return()=>{cancelled=true;window.clearTimeout(timer);};
 },[previewKey,needsRender,compareOriginal]);
 useEffect(()=>()=>{
  if(preview)URL.revokeObjectURL(preview.url);
 },[preview]);
 const previewActive=needsRender&&!compareOriginal&&preview?.key===previewKey;
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
  if(validPhotoAdjustments(candidate)){setDraft(candidate);setCompareOriginal(false);}
 }
 function apply(){
  onApply(draftNeutral?undefined:{...draft});
 }
 function applyAll(){
  if(!onApplyAll)return;
  const {regions:_local,...reusable}=draft;
  void _local;
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
 function keyLocal(event:React.KeyboardEvent<HTMLDivElement>){
  if(localTool&&(event.key==="Enter"||event.key===" ")){
   event.preventDefault();insertLocal(.5,.5);
  }
 }
 async function autoEnhance(){
  setAutoBusy(true);
  try{
   const auto=await analyzePhoto(src);
   setDraft({...DEFAULT_ADJUSTMENTS,...auto});
   setCompareOriginal(false);setCategory("Light");setLoadError("");
  }catch(cause){
   setLoadError(cause instanceof Error?cause.message:"Auto Enhance is unavailable.");
  }finally{setAutoBusy(false);}
 }
 function transform(patch:Partial<PhotoAdjustments>){
  const next={...draft,...patch};
  if(validPhotoAdjustments(next)){setDraft(next);setCompareOriginal(false);}
 }
 const previewSrc=previewActive?preview.url:src;
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
    <div className="photo-adjust-preview-stage">
     {loadError&&<p role="alert" className="warning">{loadError}</p>}
     {scope==="full"?
      <img className="photo-adjust-full-image" src={previewSrc}
       alt={"Entire source photo: "+item.name}
       style={{filter:imageFilter,transform:"scale("+zoom/100+")"}}
       onLoad={()=>setLoaded(true)}
       onError={()=>setLoadError("This photo could not be displayed. Return to Images and reload its source.")}/>
      :previewActive?
      <div className={"photo-adjust-print-frame"+(localTool?" photo-studio-target":"")} onPointerDown={addLocal}
       onKeyDown={keyLocal} role={localTool?"button":undefined} tabIndex={localTool?0:undefined}
       aria-label={localTool?"Apply local "+localTool+" retouch to crop (Enter places in center)":undefined} style={{
       aspectRatio:String(item.widthMm/item.heightMm),
       "--photo-crop-ratio":item.widthMm/item.heightMm} as CSSProperties}>
       <img className="photo-adjust-preview-composed" src={previewSrc}
        alt={"Print crop preview: "+item.name} style={{width:"100%",height:"100%",objectFit:"fill",transform:"scale("+zoom/100+")"}}/>
       {!compareOriginal&&draft.regions?.map((region,i)=><span key={i} className="photo-studio-marker" style={{left:region.x*100+"%",top:region.y*100+"%"}} aria-hidden="true"/>)}
      </div>
      :<div className={"photo-adjust-print-frame"+(localTool?" photo-studio-target":"")} onPointerDown={addLocal}
       onKeyDown={keyLocal} role={localTool?"button":undefined} tabIndex={localTool?0:undefined}
       aria-label={localTool?"Apply local "+localTool+" retouch to crop (Enter places in center)":undefined} style={{
       aspectRatio:String(item.widthMm/item.heightMm),
       "--photo-crop-ratio":item.widthMm/item.heightMm} as CSSProperties}>
       <img src={src} alt={"Print crop preview: "+item.name}
        style={{...croppedStyle,transform:"scale("+zoom/100+")"}} onLoad={()=>setLoaded(true)}
        onError={()=>setLoadError("This photo could not be displayed.")}/>
       {!compareOriginal&&draft.regions?.map((region,i)=><span key={i} className="photo-studio-marker" style={{left:region.x*100+"%",top:region.y*100+"%"}} aria-hidden="true"/>)}
      </div>}
    </div>
    <div className="photo-adjust-preview-foot">
     <span>{scope==="full"?"Full photo · no cropping":"Exact print framing"}
      {scope==="full"&&!!draft.regions?.length?" · Retouches shown in Print crop":""}</span>
     <span>{compareOriginal?"Original, unadjusted":draftNeutral?"Unadjusted":"Live adjustments"}
      {!loaded?" · Loading…":""}</span>
    </div>
    <label className="photo-studio-zoom">Preview zoom: {zoom}%
     <input aria-label="Preview zoom" type="range" min="100" max="250" step="10"
      disabled={!!localTool} value={zoom} onChange={e=>setZoom(Number(e.target.value))}/>
    </label>
   </section>
   <section className="photo-adjust-controls" aria-label="Photo tone controls">
    <h2>Photo Studio</h2>
    <p>All edits stay on this device and are applied non-destructively.</p>
    <div className="photo-studio-presets" role="group" aria-label="Photo style presets">
     {PHOTO_PRESETS.map(p=><button className="secondary-button" key={p.id}
      type="button" onClick={()=>{setDraft({...p.value});setCompareOriginal(false);}}>
      {p.label}</button>)}
    </div>
    <div className="photo-studio-auto">
     <button className="secondary-button" disabled={autoBusy} onClick={()=>void autoEnhance()}>
      <StudioIcon name="edit" size={16}/>{autoBusy?"Analyzing…":"Auto Enhance"}</button>
    </div>
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
      <div className="photo-adjust-ticks"><span>{config.min}</span><span>0</span><span>+{config.max}</span></div>
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
     <div className="photo-studio-presets">
      <button className="secondary-button" onClick={()=>transform({rotation:((draft.rotation??0)+90)%360})}>Rotate 90°</button>
      <button className="secondary-button" aria-pressed={!!draft.flipX} onClick={()=>transform({flipX:!draft.flipX})}>Flip horizontal</button>
      <button className="secondary-button" aria-pressed={!!draft.flipY} onClick={()=>transform({flipY:!draft.flipY})}>Flip vertical</button>
     </div>
     <p className="hint">Rotation uses centered cover framing within the existing print crop. Inspect the exact crop before printing.</p>
    </div>}
    <div className="photo-adjust-actions">
     <button className="secondary-button" onClick={()=>{setDraft({...DEFAULT_ADJUSTMENTS});setCompareOriginal(false);}}
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
