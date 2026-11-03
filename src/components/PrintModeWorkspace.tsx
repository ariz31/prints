import {useEffect,useMemo,useRef,useState} from "react";
import type {CSSProperties} from "react";
import type {PhotoAsset} from "../core/exportPdf.ts";
import {createPrintModeJob,getCutGeometry,modeDefaults,PRINT_MODES} from "../core/printModes.ts";
import type {PrintModeConfig,PrintModeId} from "../core/printModes.ts";
import {PAPER_SIZES} from "../core/layout.ts";
import {NOTEPAD_PRESETS} from "../core/notepadLayout.ts";
import {ID_SIZES} from "../core/idPhoto.ts";
import {assessPrintJob} from "../core/printPreflight.ts";
import StudioIcon from "./StudioIcon.tsx";
import FrameSvg from "./FrameSvg.tsx";
import {fontCssName} from "../core/fontAssets.ts";
import {cropPreviewKey} from "../core/previewCache.ts";
import {rasterizeCropPreview} from "../core/imageRaster.ts";
import {readModePresets,saveModePresets} from "../core/printModePresets.ts";

export type PrintModeStep="mode"|"preview"|"images"|"print";
type Tab=PrintModeStep;
interface Props {
 assets:readonly PhotoAsset[];
 previews:Record<string,string>;
 config:PrintModeConfig;
 onConfig:(config:PrintModeConfig)=>void;
 onAddImages:()=>void;
 onEditImage:(id:string)=>void;
 onBack:()=>void;
 step:PrintModeStep;
 onStep:(step:PrintModeStep)=>void;
}
const TABS:readonly Tab[]=["mode","preview","images","print"];
const MODE_ICONS:Record<PrintModeId,string>={
 normal:"preview",notepad:"presets",ticket:"print",
 "rush-id":"images",sticker:"layers",card:"paper",
};
function NumberField({name,value,min,max,step=1,onChange}:{
 name:string;value:number;min:number;max:number;step?:number;onChange:(value:number)=>void;
}){
 const [draft,setDraft]=useState(String(value));
 useEffect(()=>{setDraft(String(value));},[value]);
 return <label>{name}<input type="number" inputMode="decimal" min={min} max={max} step={step}
   value={draft} onChange={event=>{
     const next=event.target.value;setDraft(next);
     const n=Number(next);
     if(next.trim()!==""&&Number.isFinite(n)&&n>=min&&n<=max&&
       (step!==1||Number.isSafeInteger(n)))onChange(n);
   }} onBlur={()=>setDraft(String(value))}/></label>;
}
function Sheet({job,config,pageIndex,previews}:{
 job:ReturnType<typeof createPrintModeJob>;
 config:PrintModeConfig;pageIndex:number;previews:Record<string,string>;
}){
 const page=job.pages[pageIndex];
 const byId=new Map(job.assets.map(a=>[a.id,a]));
 return <div className="mode-sheet" role="img" aria-label={"Print-ready layout for sheet "+(pageIndex+1)}
   style={{aspectRatio:job.paper.widthMm+"/"+job.paper.heightMm,
     "--mode-ratio":job.paper.widthMm/job.paper.heightMm} as CSSProperties}>
   {page?.placements.map(p=>{
     const asset=byId.get(p.itemId);
     if(!asset)return null;
     // The classic preview was rendered for a different crop/size. Never show
     // it as if it represented the exact physical print-mode output.
     const src=previews[asset.id];
     const style={
       left:p.xMm/job.paper.widthMm*100+"%",top:p.yMm/job.paper.heightMm*100+"%",
       width:p.widthMm/job.paper.widthMm*100+"%",height:p.heightMm/job.paper.heightMm*100+"%",
     } as CSSProperties;
     return <div className={"mode-placement"+(config.cutGuides&&!job.cuts?" mode-placement-outline":"")}
       key={p.itemId+"-"+p.copyIndex} style={style}>
       {src?<img src={src} alt="" draggable={false}/>:
         <span className="mode-crop-pending" role="status">Preparing exact crop…</span>}
       {src&&(asset.layers??[]).filter(layer=>layer.visible).map(layer=>
         layer.kind==="frame"
           ? <div className="print-layer print-layer-frame" key={layer.id}
               style={{inset:0,opacity:layer.opacity??1}}>
               <FrameSvg frameId={layer.frameId} widthMm={asset.widthMm}
                 heightMm={asset.heightMm} weight={layer.weight} inset={layer.inset}
                 spacing={layer.spacing} color={layer.color}/>
             </div>
           : <div key={layer.id} className={"print-layer print-layer-"+layer.kind} style={{
             left:layer.x*100+"%",top:layer.y*100+"%",
             width:layer.width*100+"%",height:layer.height*100+"%",
             backgroundColor:layer.kind==="text"?"transparent":layer.color,
             color:layer.color,opacity:layer.opacity??1,
             fontSize:layer.kind==="text"
               ?String(layer.fontSizePt/72*25.4/asset.widthMm*100)+"cqw":undefined,
             fontFamily:layer.kind==="text"?fontCssName(layer):undefined,
             whiteSpace:layer.kind==="text"?"pre":undefined,
             textAlign:layer.kind==="text"?layer.align??"left":undefined,
             lineHeight:layer.kind==="text"?layer.lineHeightFactor??1.2:undefined,
             WebkitTextStroke:layer.kind==="text"&&layer.outlinePt
               ?String(layer.outlinePt*2/72*25.4/asset.widthMm*100)+"cqw "+(layer.outlineColor??"#ffffff"):undefined,
             textShadow:layer.kind==="text"&&layer.shadowPt
               ?String(layer.shadowPt/72*25.4/asset.widthMm*100)+"cqw "+String(layer.shadowPt/72*25.4/asset.widthMm*100)+"cqw "+(layer.shadowColor??"#333333"):undefined,
           }}>{layer.kind==="text"?layer.text:null}</div>)}
       {p.serial&&<span className="mode-serial" style={{
         left:p.serial.xPercent+"%",top:p.serial.yPercent+"%",
         fontSize:"clamp(5px,"+(p.serial.fontSizePt*25.4/72/p.widthMm*100)+"cqw,28px)",
       }}>{p.serial.text}</span>}
     </div>;
   })}
   {config.cutGuides&&job.cuts&&<svg className="mode-cuts" viewBox={"0 0 "+job.paper.widthMm+" "+job.paper.heightMm}
     preserveAspectRatio="none" aria-hidden="true">
     {job.cuts.map((line,i)=><line key={i} x1={line.x1} y1={line.y1}
       x2={line.x2} y2={line.y2} stroke="#b6bbc2" strokeWidth=".16"/>)}
   </svg>}
 </div>;
}

export default function PrintModeWorkspace({assets,previews,config:initialConfig,onConfig:saveConfig,onAddImages,onEditImage,onBack,step:tab,onStep:setTab}:Props){
 // Keep interactive changes immediate. Persist the complete configuration in
 // one debounced project checkpoint instead of rereading image Blobs per keystroke.
 const [config,setConfig]=useState(initialConfig);
 const saveConfigRef=useRef(saveConfig);saveConfigRef.current=saveConfig;
 const unsaved=useRef<PrintModeConfig|null>(null);
 const saveTimer=useRef<number|null>(null);
 function onConfig(next:PrintModeConfig){
   setConfig(next);unsaved.current=next;
   if(saveTimer.current!==null)window.clearTimeout(saveTimer.current);
   saveTimer.current=window.setTimeout(()=>{
     saveTimer.current=null;
     const pending=unsaved.current;unsaved.current=null;
     if(pending)saveConfigRef.current(pending);
   },650);
 }
 useEffect(()=>()=>{
   if(saveTimer.current!==null)window.clearTimeout(saveTimer.current);
   if(unsaved.current)saveConfigRef.current(unsaved.current);
 },[]);
 // Recovery and externally restored projects may update their configuration
 // after this workspace has mounted. Keep local controls in sync unless the
 // operator has a newer unsaved edit in progress.
 useEffect(()=>{
   if(!unsaved.current)setConfig(initialConfig);
 },[initialConfig]);
 const [modePresets,setModePresets]=useState(readModePresets);
 const [presetName,setPresetName]=useState("My print setup");
 const [presetId,setPresetId]=useState("");
 function storeModePreset(){
   try{
     const name=presetName.trim();
     if(!name||name.length>80)throw new Error("Enter a preset name (up to 80 characters).");
     const next=[{id:crypto.randomUUID(),name,config},...modePresets].slice(0,40);
     saveModePresets(next);setModePresets(next);setPresetId(next[0].id);
     setMessage("Print-mode preset saved in this browser.");setError("");
   }catch(e){setError(e instanceof Error?e.message:"Could not save print preset.");}
 }
 function loadModePreset(){
   const chosen=modePresets.find(p=>p.id===presetId);
   if(!chosen)return;
   onConfig(chosen.config);setPageIndex(0);
   setMessage("Loaded "+chosen.name+". Review print dimensions and images before printing.");setError("");
 }
 function deleteModePreset(){
   const next=modePresets.filter(p=>p.id!==presetId);
   try{saveModePresets(next);setModePresets(next);setPresetId("");setError("");
     setMessage("Preset deleted from this browser.");}
   catch(e){setError(e instanceof Error?e.message:"Could not remove print preset.");}
 }
 const [pageIndex,setPageIndex]=useState(0);
 const [busy,setBusy]=useState(false);
 const [progress,setProgress]=useState<{completed:number;total:number}|null>(null);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const controller=useRef<AbortController|null>(null);
 const rasterCache=useRef(new Map<string,{key:string;url:string}>());
 const rasterPending=useRef(new Map<string,Promise<string>>());
 const rasterKeys=useRef<Record<string,string>>({});
 const [rasterRevision,setRasterRevision]=useState(0);
 const [rasterErrors,setRasterErrors]=useState<Record<string,{key:string;message:string}>>({});
 const [rasterRetry,setRasterRetry]=useState(0);
 useEffect(()=>()=>{
   controller.current?.abort();
   rasterKeys.current={};
   for(const {url} of rasterCache.current.values())URL.revokeObjectURL(url);
   rasterCache.current.clear();
 },[]);
 const update=<K extends keyof PrintModeConfig>(key:K,value:PrintModeConfig[K])=>
   onConfig({...config,[key]:value});
 const computed=useMemo(()=>{
   try{return {job:createPrintModeJob(assets,config),error:""};}
   catch(e){return {job:null,error:e instanceof Error?e.message:"Invalid print job."};}
 },[assets,config]);
 const job=computed.job;
 useEffect(()=>{
   const entries=job?.assets??[];
   rasterKeys.current=Object.fromEntries(entries.map(a=>[a.id,cropPreviewKey(a)]));
   // Release decoded rasters from removed designs or obsolete crop dimensions.
   // Large batches can otherwise retain every historical preview until exit.
   for(const [id,cached] of rasterCache.current){
     if(rasterKeys.current[id]!==cached.key){
       URL.revokeObjectURL(cached.url);
       rasterCache.current.delete(id);
     }
   }
   let cancelled=false;
   // Process only one crop at a time. This bounds concurrent decoding and
   // canvas memory when a job uses many different source designs.
   const renderQueue=async()=>{
     for(const asset of entries){
       if(cancelled)return;
       const key=cropPreviewKey(asset);
       if(rasterCache.current.get(asset.id)?.key===key)continue;
       let pending=rasterPending.current.get(key);
       if(!pending){
         pending=rasterizeCropPreview(asset).then(blob=>URL.createObjectURL(blob));
         rasterPending.current.set(key,pending);
       }
       try{
         const url=await pending;
         if(rasterPending.current.get(key)===pending)rasterPending.current.delete(key);
         if(cancelled){
           // A newer queue may have adopted this exact in-flight raster.
           if(rasterKeys.current[asset.id]!==key)URL.revokeObjectURL(url);
           return;
         }
         if(rasterKeys.current[asset.id]!==key){URL.revokeObjectURL(url);continue;}
         const previous=rasterCache.current.get(asset.id);
         if(previous?.key===key){
           if(previous.url!==url)URL.revokeObjectURL(url);
           continue;
         }
         if(previous)URL.revokeObjectURL(previous.url);
         rasterCache.current.set(asset.id,{key,url});
         setRasterErrors(old=>{
           if(old[asset.id]?.key!==key)return old;
           const next={...old};delete next[asset.id];return next;
         });
         setRasterRevision(n=>n+1);
       }catch(cause){
         if(rasterPending.current.get(key)===pending)rasterPending.current.delete(key);
         if(!cancelled&&rasterKeys.current[asset.id]===key)
           setRasterErrors(old=>({...old,[asset.id]:{
             key,message:cause instanceof Error?cause.message:"Image preview could not be rendered.",
           }}));
       }
     }
   };
   void renderQueue();
   return ()=>{cancelled=true;};
 },[job,rasterRetry]);
 const exactPreviews=useMemo(()=>{
   const result:Record<string,string>={};
   for(const asset of job?.assets??[]){
     const cached=rasterCache.current.get(asset.id);
     if(cached?.key===cropPreviewKey(asset))result[asset.id]=cached.url;
   }
   return result;
 },[job,rasterRevision]);
 const rasterFailure=job?.assets.find(asset=>rasterErrors[asset.id]?.key===cropPreviewKey(asset));
 const previewError=rasterFailure?rasterErrors[rasterFailure.id]?.message:null;
 const previewPage=job?Math.min(pageIndex,Math.max(0,job.pages.length-1)):0;
 const issues=useMemo(()=>job?assessPrintJob(job.assets,job.pages,job.paper,{
   cutGuides:config.cutGuides,trimStyle:"outline",marginMm:config.marginMm,
   gapMm:config.gapMm,
   ...(config.mode==="notepad"?{notepadPreset:config.grid}:{}),
 },config.dpi):null,[job,config]);
 const allowed=!!job&&job.pages.length>0&&!computed.error&&!issues?.errors.length&&!previewError;
 const cutting=config.mode==="notepad"||config.mode==="ticket";
 const selectedImage=assets.find(a=>a.id===config.selectedImageId)??assets[0];
 const grid=cutting&&job?.grid?job.grid:cutting?(()=>{try{return getCutGeometry(config);}catch{return null;}})():null;
 const modeLabel=PRINT_MODES.find(m=>m.id===config.mode)?.label??"Print";
 async function exportFile(openPrint:boolean){
   if(!allowed||!job||busy)return;
   // Open synchronously from the gesture to prevent popup blockers after PDF generation.
   const viewer=openPrint?window.open("about:blank","_blank"):null;
   if(openPrint&&!viewer){setError("Your browser blocked the print tab. Allow popups or use Download PDF.");return;}
   if(viewer){viewer.document.title="Preparing PRINTS PDF";viewer.document.body.textContent="Preparing your print-ready PDF locally…";}
   const abort=new AbortController();controller.current=abort;
   setBusy(true);setError("");setMessage("");setProgress({completed:0,total:1});
   try{
     const {exportToPdf}=await import("../core/exportPdf.ts");
     const blob=await exportToPdf(job.assets,job.pages,job.paper,config.cutGuides,undefined,
       "outline",{marginMm:config.marginMm,gapMm:config.gapMm},config.dpi,{
         signal:abort.signal,onProgress:(completed,total)=>setProgress({completed,total}),
         ...(job.cuts?{notepadCuts:job.cuts}:{}),lightCutMarks:true,
       });
     if(abort.signal.aborted)throw new Error("Export canceled.");
     const url=URL.createObjectURL(blob);
     if(viewer){
       viewer.location.replace(url);
       setMessage("Print-ready PDF opened. Select 100% / Actual Size in your print dialog.");
     }else{
       const link=document.createElement("a");
       link.href=url;
       link.download="prints-"+config.mode+"-"+new Date().toISOString().slice(0,10)+".pdf";
       document.body.appendChild(link);link.click();link.remove();
       setMessage("Downloaded "+job.pages.length+" sheet(s). Print at 100% / Actual Size.");
     }
     window.setTimeout(()=>URL.revokeObjectURL(url),openPrint?5*60_000:60_000);
   }catch(e){
     if(viewer&&!viewer.closed)viewer.close();
     setError(abort.signal.aborted?"Export canceled.":e instanceof Error?e.message:"PDF generation failed.");
   }finally{
     if(controller.current===abort)controller.current=null;
     setBusy(false);setProgress(null);
   }
 }
 return <main className="print-mode-workspace">
   <div className="mode-heading">
     <div><div className="mode-eyebrow">PRINTS / Production</div>
       <h1>Print Modes</h1>
       <p>Choose a job, inspect every sheet, assign images, then print at actual size.</p>
     </div>
     <button className="secondary-button" onClick={onBack}><StudioIcon name="left" size={16}/>Classic workspace</button>
   </div>
   <nav className="mode-tabs" aria-label="Print mode workflow">
     {TABS.map((t,i)=><button type="button" key={t} aria-current={tab===t?"step":undefined}
       className={tab===t?"is-active":""} onClick={()=>setTab(t)}>
       <span className="mode-tab-index">{i+1}</span>{t==="mode"?"Mode":t==="preview"?"Preview":t==="images"?"Images":"Print"}
     </button>)}
   </nav>
   <div className="mode-content">
     {tab==="mode"&&<section aria-labelledby="modes-title">
       <div className="mode-section-title"><h2 id="modes-title">Choose a printing workflow</h2>
         <p>Settings and output are prepared for your selected job.</p></div>
       <div className="mode-card-grid">
         {PRINT_MODES.map(m=><button type="button" key={m.id}
           className={"mode-card"+(config.mode===m.id?" selected":"")}
           aria-pressed={config.mode===m.id} onClick={()=>{
             onConfig(modeDefaults(m.id,config));setError("");setPageIndex(0);
           }}>
           <span className="mode-card-icon"><StudioIcon name={MODE_ICONS[m.id] as Parameters<typeof StudioIcon>[0]["name"]} size={24}/></span>
           <strong>{m.label}</strong><small>{m.description}</small>
           <span className="mode-card-check" aria-hidden="true">{config.mode===m.id?"✓":""}</span>
         </button>)}
       </div>
       <div className="mode-quick-summary" aria-live="polite">
         <strong>{modeLabel}</strong>
         <span>{assets.length} design{assets.length===1?"":"s"} available ·
           {job?job.pages.length:"—"} sheets · {config.quantity} finished pieces</span>
       </div>
       <div className="mode-saved-presets">
         <h3>Reusable mode presets</h3>
         <div className="mode-field-row">
           <label>Preset name<input value={presetName} maxLength={80}
             onChange={e=>setPresetName(e.target.value)}/></label>
           <label>Saved preset
             <select value={presetId} onChange={e=>setPresetId(e.target.value)}>
               <option value="">Select a saved configuration</option>
               {modePresets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
             </select>
           </label>
         </div>
         <div className="mode-output-actions">
           <button className="secondary-button" onClick={storeModePreset}>Save preset</button>
           <button className="secondary-button" disabled={!presetId} onClick={loadModePreset}>Apply</button>
           <button className="secondary-button" disabled={!presetId} onClick={deleteModePreset}>Delete</button>
         </div>
         <p className="hint">Saved here on your device. Current mode settings are also retained with project backups.</p>
       </div>
       {error&&<p role="alert" className="banner danger">{error}</p>}
       {message&&<p role="status" className="banner success">{message}</p>}
     </section>}
     {tab==="preview"&&<section className="mode-preview-layout" aria-label="Print layout and settings">
       <div className="mode-inspector">
         <div className="mode-section-title"><h2>{modeLabel}</h2><p>Live production settings</p></div>
         <div className="mode-field-row">
           <label>Paper
             <select value={config.paper} disabled={config.mode==="notepad"}
               onChange={e=>update("paper",e.target.value as PrintModeConfig["paper"])}>
               {Object.keys(PAPER_SIZES).map(s=><option key={s} value={s}>{s}</option>)}
             </select>
           </label>
           <label>Orientation
             <select value={config.orientation} onChange={e=>update("orientation",e.target.value as PrintModeConfig["orientation"])}>
               <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
             </select>
           </label>
         </div>
         <NumberField name="Total finished pieces" value={config.quantity} min={1} max={1000}
           onChange={n=>update("quantity",n)}/>
         {cutting&&<label>Equal cutting grid
           <select value={config.grid} onChange={e=>update("grid",e.target.value as PrintModeConfig["grid"])}>
             {NOTEPAD_PRESETS.map(p=><option key={p.id} value={p.id}>{p.label} ·
               {config.orientation==="portrait"?p.columns:p.rows} ×
               {config.orientation==="portrait"?p.rows:p.columns}</option>)}
           </select>
         </label>}
         {config.mode==="rush-id"&&<label>Rush ID photo size
           <select value={config.idSize} onChange={e=>update("idSize",e.target.value)}>
             {ID_SIZES.map(id=><option key={id.id} value={id.id}>{id.label} · {id.widthMm} × {id.heightMm} mm</option>)}
             <option value="id-custom">Custom ID dimensions</option>
           </select>
         </label>}
         {config.mode==="rush-id"&&config.idSize==="id-custom"&&<div className="mode-field-row">
           <NumberField name="ID width (mm)" value={config.productWidthMm} min={10} max={200}
             step={.1} onChange={n=>update("productWidthMm",n)}/>
           <NumberField name="ID height (mm)" value={config.productHeightMm} min={10} max={200}
             step={.1} onChange={n=>update("productHeightMm",n)}/>
         </div>}
         {(config.mode==="card"||config.mode==="sticker")&&<div className="mode-field-row">
           <NumberField name="Product width (mm)" value={config.productWidthMm} min={10} max={200}
             step={.1} onChange={n=>update("productWidthMm",n)}/>
           <NumberField name="Product height (mm)" value={config.productHeightMm} min={10} max={200}
             step={.1} onChange={n=>update("productHeightMm",n)}/>
         </div>}
         <div className="mode-field-row">
           <NumberField name={cutting?"Artwork inset (mm)":"Page margin (mm)"}
             value={config.marginMm} min={0} max={40} step={.5} onChange={n=>update("marginMm",n)}/>
           {!cutting&&<NumberField name="Gap (mm)" value={config.gapMm} min={0} max={30}
             step={.5} onChange={n=>update("gapMm",n)}/>}
         </div>
         <label className="mode-check"><input type="checkbox" checked={config.cutGuides}
           onChange={e=>update("cutGuides",e.target.checked)}/>Light cutting guides</label>
         {config.mode==="ticket"&&<fieldset className="mode-numbering">
           <legend>Ticket numbering</legend>
           <label>Sequence
             <select value={config.numberingOrder} onChange={e=>update("numberingOrder",e.target.value as PrintModeConfig["numberingOrder"])}>
               <option value="cut-stack">Cut-and-stack (number down each stack)</option>
               <option value="sequential">Sequential across each sheet</option>
               <option value="repeat-sheet">One number repeated per sheet</option>
             </select>
           </label>
           <div className="mode-field-row">
             <NumberField name="Start" value={config.numberStart} min={0} max={99999999}
               onChange={n=>update("numberStart",n)}/>
             <NumberField name="Increment" value={config.numberIncrement} min={1} max={100000}
               onChange={n=>update("numberIncrement",n)}/>
             <NumberField name="Digits" value={config.numberDigits} min={1} max={10}
               onChange={n=>update("numberDigits",n)}/>
             <NumberField name="Font (pt)" value={config.numberFontPt} min={5} max={30}
               onChange={n=>update("numberFontPt",n)}/>
           </div>
           <div className="mode-field-row">
             <label>Prefix<input maxLength={15} value={config.numberPrefix} placeholder="Optional"
               onChange={e=>{if(/^[\x20-\x7e]*$/.test(e.target.value))update("numberPrefix",e.target.value);}}/></label>
             <label>Suffix<input maxLength={15} value={config.numberSuffix} placeholder="Optional"
               onChange={e=>{if(/^[\x20-\x7e]*$/.test(e.target.value))update("numberSuffix",e.target.value);}}/></label>
           </div>
           <div className="mode-field-row">
             <NumberField name="Number X (%)" value={config.numberX} min={0} max={100}
               onChange={n=>update("numberX",n)}/>
             <NumberField name="Number Y (%)" value={config.numberY} min={0} max={100}
               onChange={n=>update("numberY",n)}/>
           </div>
         </fieldset>}
         {config.mode==="rush-id"&&<p className="hint">Crop and background can be refined in Smart ID Studio from the classic workspace. This mode arranges the finished photos for cutting; it does not certify official ID standards.</p>}
         {grid&&<p className="hint">Exact cut piece: {grid.cellWidthMm.toFixed(2)} × {grid.cellHeightMm.toFixed(2)} mm.
           Artwork is inset to accommodate non-borderless printers.</p>}
       </div>
       <div className="mode-preview-pane">
         <div className="mode-preview-toolbar">
           <strong>Live sheet preview</strong>
           <div className="mode-pages">
             <button className="secondary-button" aria-label="Previous print sheet" disabled={previewPage===0}
               onClick={()=>setPageIndex(Math.max(0,previewPage-1))}>‹</button>
             <span>Sheet {job?.pages.length?previewPage+1:0} / {job?.pages.length??0}</span>
             <button className="secondary-button" aria-label="Next print sheet"
               disabled={!job||previewPage>=job.pages.length-1}
               onClick={()=>setPageIndex(previewPage+1)}>›</button>
           </div>
         </div>
         {job?.pages.length?<Sheet job={job} config={config} pageIndex={previewPage} previews={exactPreviews}/>:
           <div className="mode-no-sheet">Add images to preview the selected print mode.</div>}
         <p className="hint">On-screen preview is proportional. Exported PDF uses exact millimeter measurements.</p>
         {computed.error&&<p role="alert" className="banner danger">{computed.error}</p>}
         {previewError&&<div className="mode-preview-failure" role="alert">
           <span>Exact image preview failed: {previewError}</span>
           <button className="secondary-button" onClick={()=>setRasterRetry(n=>n+1)}>Retry preview</button>
         </div>}
       </div>
     </section>}
     {tab==="images"&&<section className="mode-images-section">
       <div className="mode-section-title"><h2>Images and assignments</h2>
         <p>Use existing edited designs or import more; original artwork is never altered.</p></div>
       <button className="primary-button" onClick={onAddImages}><StudioIcon name="upload" size={17}/>Add image files</button>
       {assets.length>0&&<div className="mode-image-options">
         <label>Image arrangement
           <select value={config.imageAssignment} disabled={config.mode==="notepad"}
             onChange={e=>update("imageAssignment",e.target.value as PrintModeConfig["imageAssignment"])}>
             <option value="first">Repeat one selected design</option>
             {config.mode!=="notepad"&&<option value="cycle">Use all designs</option>}
             {config.mode==="ticket"&&<option value="slots">Choose a design for every cutting position</option>}
           </select>
         </label>
         {(config.imageAssignment==="first"||config.mode==="notepad"||config.imageAssignment==="slots")&&
           <label>Default image
             <select value={config.selectedImageId||selectedImage?.id||""}
               onChange={e=>update("selectedImageId",e.target.value)}>
               {config.selectedImageId&&!assets.some(a=>a.id===config.selectedImageId)&&
                 <option value={config.selectedImageId} disabled>Missing saved image — reselect</option>}
               {assets.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
             </select>
           </label>}
       </div>}
       <div className="mode-image-grid">
         {assets.map(a=><div className="mode-image-card" key={a.id}>
           <img src={previews[a.id]??a.processedUrl??a.url} alt={a.name} loading="lazy"/>
           <div><strong title={a.name}>{a.name}</strong><small>{a.pixelWidth} × {a.pixelHeight} px</small>
             <button className="secondary-button" onClick={()=>onEditImage(a.id)}>Edit image</button></div>
         </div>)}
         {!assets.length&&<p className="mode-no-sheet">No images imported yet.</p>}
       </div>
       {config.mode==="ticket"&&config.imageAssignment==="slots"&&grid&&assets.length>0&&
         <div className="mode-slot-grid">
           <h3>Images by cut position</h3>
           <p className="hint">Each position uses the same design across every sheet, so cut stacks stay aligned.</p>
           <div className="mode-field-row">
             {Array.from({length:grid.perSheet},(_,slot)=><label key={slot}>Position {slot+1}
               <select value={config.slotImageIds[slot]||""}
                 onChange={e=>{
                   const next=[...config.slotImageIds];next[slot]=e.target.value;update("slotImageIds",next);
                 }}>
                 <option value="">Default image</option>
                 {config.slotImageIds[slot]&&!assets.some(a=>a.id===config.slotImageIds[slot])&&
                   <option value={config.slotImageIds[slot]} disabled>Missing saved image — reassign</option>}
                 {assets.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
               </select>
             </label>)}
           </div>
         </div>}
     </section>}
     {tab==="print"&&<section className="mode-print-section">
       <div className="mode-section-title"><h2>Print production</h2>
         <p>Preflight checks run before local PDF generation.</p></div>
       <div className="mode-print-summary">
         <div><small>Mode</small><strong>{modeLabel}</strong></div>
         <div><small>Pieces</small><strong>{job?.total??0}</strong></div>
         <div><small>Print sheets</small><strong>{job?.pages.length??0}</strong></div>
         <div><small>Paper</small><strong>{config.paper} · {config.orientation}</strong></div>
         <div><small>Export quality</small><strong>{config.dpi} DPI</strong></div>
         <div><small>Guides</small><strong>{config.cutGuides?"Light":"Off"}</strong></div>
       </div>
       <label className="mode-dpi">Export resolution
         <select value={config.dpi} onChange={e=>update("dpi",Number(e.target.value) as 300|600)}>
           <option value={300}>300 DPI · standard printing</option>
           <option value={600}>600 DPI · more memory required</option>
         </select>
       </label>
       {computed.error&&<p role="alert" className="banner danger">{computed.error}</p>}
       {previewError&&<p role="alert" className="banner danger">Exact preview failed: {previewError}. Reopen Preview and retry.</p>}
       {issues&&<div className="mode-preflight">
         <h3>Print checks · {issues.errors.length?issues.errors.length+" blocking":
           issues.warnings.length?issues.warnings.length+" warnings":"Ready"}</h3>
         {issues.errors.map((e,i)=><p role="alert" className="banner danger" key={i}>{e.title}: {e.detail}</p>)}
         {issues.warnings.map((e,i)=><p className="hint" key={i}>⚠ {e.title}: {e.detail}</p>)}
         {!issues.errors.length&&!issues.warnings.length&&<p className="hint">Geometry and source resolution checked. Keep your PDF viewer at Actual Size.</p>}
       </div>}
       <div className="mode-output-actions">
         <button className="primary-button" disabled={!allowed||busy}
           onClick={()=>void exportFile(false)}><StudioIcon name="download" size={17}/>Download PDF</button>
         <button className="secondary-button" disabled={!allowed||busy}
           onClick={()=>void exportFile(true)}><StudioIcon name="print" size={17}/>Open for printing</button>
         {busy&&<button className="secondary-button" onClick={()=>controller.current?.abort()}>Cancel export</button>}
       </div>
       {progress&&<p role="status" className="hint">Generating locally: {progress.completed} / {progress.total}</p>}
       {error&&<p role="alert" className="banner danger">{error}</p>}
       {message&&<p role="status" className="banner success">{message}</p>}
       <p className="hint">All processing stays in your browser. Printing requires 100% / Actual Size, with browser/printer scaling disabled. Verify your printer's printable margins before cutting.</p>
     </section>}
   </div>
   <div className="mode-footer">
     <span>{assets.length} images · {job?.pages.length??0} sheets</span>
     <div>
       {tab!=="mode"&&<button className="secondary-button" onClick={()=>setTab(TABS[TABS.indexOf(tab)-1])}>Back</button>}
       {tab!=="print"&&<button className="primary-button" onClick={()=>setTab(TABS[TABS.indexOf(tab)+1])}>Continue</button>}
     </div>
   </div>
 </main>;
}
