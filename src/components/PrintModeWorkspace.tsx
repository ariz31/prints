import {useState} from "react";
import type {PrintModeConfig,PrintModeId} from "../core/printModes.ts";
import {DEFAULT_PRINT_MODE,PRINT_MODES,modeDefaults,getCutGeometry} from "../core/printModes.ts";
import {readModePresets,saveModePresets} from "../core/printModePresets.ts";
import {PAPER_SIZES} from "../core/layout.ts";
import {NOTEPAD_PRESETS} from "../core/notepadLayout.ts";
import {ID_SIZES} from "../core/idPhoto.ts";
import type {PhotoAsset} from "../core/exportPdf.ts";
import StudioIcon from "./StudioIcon.tsx";

const MODE_ICONS:Record<PrintModeId,Parameters<typeof StudioIcon>[0]["name"]>={
 normal:"preview",notepad:"presets",ticket:"print",
 "rush-id":"images",sticker:"layers",card:"paper",
};
export function ModeNumber({name,value,min,max,step=1,onChange}:{
 name:string;value:number;min:number;max:number;step?:number;onChange:(n:number)=>void;
}){
 const [draft,setDraft]=useState(String(value));
 // Numeric controls commit only valid finite values; an intermediate empty
 // edit must not reset a setting or accidentally generate thousands of pages.
 const display=Number(draft)===value?draft:String(value);
 return <label>{name}<input type="number" inputMode="decimal" min={min} max={max} step={step}
   value={display} onChange={event=>{
     const value=event.target.value;setDraft(value);
     const n=Number(value);
     if(value.trim()!==""&&Number.isFinite(n)&&n>=min&&n<=max&&
       (step!==1||Number.isSafeInteger(n)))onChange(n);
   }} onBlur={()=>setDraft(String(value))}/></label>;
}
export function PrintModeSettings({config,onConfig}:{
 config:PrintModeConfig;onConfig:(config:PrintModeConfig)=>void;
}){
 const set=<K extends keyof PrintModeConfig>(key:K,value:PrintModeConfig[K])=>onConfig({...config,[key]:value});
 const cutting=config.mode==="notepad"||config.mode==="ticket";
 let grid:ReturnType<typeof getCutGeometry>|null=null;
 try{if(cutting)grid=getCutGeometry(config);}catch{/* The job error appears in preflight. */}
 return <div className="mode-inspector mode-inline-settings" aria-label="Selected print mode settings">
   <div className="mode-field-row">
     <label>Paper
       <select value={config.paper} disabled={config.mode==="notepad"}
         onChange={e=>set("paper",e.target.value as PrintModeConfig["paper"])}>
         {Object.keys(PAPER_SIZES).map(size=><option key={size} value={size}>{size}</option>)}
       </select>
     </label>
     <label>Orientation
       <select value={config.orientation}
         onChange={e=>set("orientation",e.target.value as PrintModeConfig["orientation"])}>
         <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
       </select>
     </label>
   </div>
   <ModeNumber name="Finished pieces" value={config.quantity} min={1} max={1000}
     onChange={n=>set("quantity",n)}/>
   {cutting&&<label>Cutting grid
     <select value={config.grid} onChange={e=>set("grid",e.target.value as PrintModeConfig["grid"])}>
       {NOTEPAD_PRESETS.map(p=><option key={p.id} value={p.id}>{p.label} ·
         {config.orientation==="portrait"?p.columns:p.rows} ×
         {config.orientation==="portrait"?p.rows:p.columns}</option>)}
     </select>
   </label>}
   {config.mode==="rush-id"&&<label>ID photo dimensions
     <select value={config.idSize} onChange={e=>set("idSize",e.target.value)}>
       {ID_SIZES.map(p=><option key={p.id} value={p.id}>{p.label} · {p.widthMm} × {p.heightMm} mm</option>)}
       <option value="id-custom">Custom</option>
     </select>
   </label>}
   {((config.mode==="rush-id"&&config.idSize==="id-custom")||
      config.mode==="sticker"||config.mode==="card")&&<div className="mode-field-row">
       <ModeNumber name="Width (mm)" value={config.productWidthMm} min={10} max={200} step={.1}
         onChange={n=>set("productWidthMm",n)}/>
       <ModeNumber name="Height (mm)" value={config.productHeightMm} min={10} max={200} step={.1}
         onChange={n=>set("productHeightMm",n)}/>
     </div>}
   <div className="mode-field-row">
     <ModeNumber name={cutting?"Artwork inset (mm)":"Page margin (mm)"}
       value={config.marginMm} min={0} max={40} step={.5}
       onChange={n=>set("marginMm",n)}/>
     {!cutting&&<ModeNumber name="Item gap (mm)" value={config.gapMm} min={0} max={30} step={.5}
       onChange={n=>set("gapMm",n)}/>}
   </div>
   <label className="mode-check"><input type="checkbox" checked={config.cutGuides}
     onChange={e=>set("cutGuides",e.target.checked)}/>Light cutting guides</label>
   {config.mode==="ticket"&&<fieldset className="mode-numbering">
     <legend>Ticket numbering</legend>
     <label>Numbering sequence
       <select value={config.numberingOrder}
         onChange={e=>set("numberingOrder",e.target.value as PrintModeConfig["numberingOrder"])}>
         <option value="cut-stack">Cut-and-stack</option>
         <option value="sequential">Sequential across sheets</option>
         <option value="repeat-sheet">Repeat number per sheet</option>
       </select>
     </label>
     <div className="mode-field-row">
       <ModeNumber name="Start" value={config.numberStart} min={0} max={99999999} onChange={n=>set("numberStart",n)}/>
       <ModeNumber name="Increment" value={config.numberIncrement} min={1} max={100000} onChange={n=>set("numberIncrement",n)}/>
       <ModeNumber name="Zero-padding digits" value={config.numberDigits} min={1} max={10} onChange={n=>set("numberDigits",n)}/>
       <ModeNumber name="Font (pt)" value={config.numberFontPt} min={5} max={30} onChange={n=>set("numberFontPt",n)}/>
     </div>
     <div className="mode-field-row">
       <label>Prefix<input value={config.numberPrefix} maxLength={15} onChange={e=>{
         if(/^[\x20-\x7e]*$/.test(e.target.value))set("numberPrefix",e.target.value);
       }}/></label>
       <label>Suffix<input value={config.numberSuffix} maxLength={15} onChange={e=>{
         if(/^[\x20-\x7e]*$/.test(e.target.value))set("numberSuffix",e.target.value);
       }}/></label>
     </div>
     <div className="mode-field-row">
       <ModeNumber name="Number X (%)" value={config.numberX} min={0} max={100} onChange={n=>set("numberX",n)}/>
       <ModeNumber name="Number Y (%)" value={config.numberY} min={0} max={100} onChange={n=>set("numberY",n)}/>
     </div>
   </fieldset>}
   {grid&&<p className="hint">Each cut: {grid.cellWidthMm.toFixed(2)} × {grid.cellHeightMm.toFixed(2)} mm.
     Keep your artwork within the inset. Print at 100% / Actual Size.</p>}
   <label>PDF resolution
     <select value={config.dpi} onChange={e=>set("dpi",Number(e.target.value) as 300|600)}>
       <option value={300}>300 DPI</option><option value={600}>600 DPI</option>
     </select>
   </label>
 </div>;
}

export function PrintModeImageAssignments({assets,config,onConfig}:{
 assets:readonly PhotoAsset[];config:PrintModeConfig;onConfig:(c:PrintModeConfig)=>void;
}){
 const set=<K extends keyof PrintModeConfig>(key:K,value:PrintModeConfig[K])=>onConfig({...config,[key]:value});
 const current=assets.find(a=>a.id===config.selectedImageId)??assets[0];
 let grid:ReturnType<typeof getCutGeometry>|null=null;
 try{if(config.mode==="ticket")grid=getCutGeometry(config);}catch{/* Invalid settings reported on Preview. */}
 return <div className="mode-image-options mode-inline-assignments" aria-label="Print mode image assignment">
   <label>Image assignment
     <select value={config.mode==="notepad"?"first":config.imageAssignment}
       disabled={config.mode==="notepad"}
       onChange={e=>set("imageAssignment",e.target.value as PrintModeConfig["imageAssignment"])}>
       <option value="first">Repeat selected design</option>
       {config.mode!=="notepad"&&<option value="cycle">Cycle all designs</option>}
       {config.mode==="ticket"&&<option value="slots">Assign each cutting position</option>}
     </select>
   </label>
   {(config.imageAssignment!=="cycle"||config.mode==="notepad")&&<label>Source design
     <select value={config.selectedImageId||current?.id||""}
       onChange={e=>set("selectedImageId",e.target.value)}>
       {config.selectedImageId&&!assets.some(a=>a.id===config.selectedImageId)&&
         <option value={config.selectedImageId} disabled>Missing design — reselect</option>}
       {!assets.length&&<option value="">Add a design first</option>}
       {assets.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
     </select>
   </label>}
   {config.mode==="ticket"&&config.imageAssignment==="slots"&&grid&&<fieldset className="mode-position-assignments">
     <legend>Design per cutting position</legend>
     {Array.from({length:grid.perSheet},(_,slot)=><label key={slot}>Cut position {slot+1}
       <select value={config.slotImageIds[slot]||""} onChange={e=>{
         const ids=[...config.slotImageIds];ids[slot]=e.target.value;set("slotImageIds",ids);
       }}>
         <option value="">Default design</option>
         {config.slotImageIds[slot]&&!assets.some(a=>a.id===config.slotImageIds[slot])&&
           <option value={config.slotImageIds[slot]} disabled>Missing design — reassign</option>}
         {assets.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
       </select>
     </label>)}
   </fieldset>}
 </div>;
}
interface Props{
 assets:readonly PhotoAsset[];
 config?:PrintModeConfig;
 onConfig:(config:PrintModeConfig)=>void;
 onPreview:()=>void;
}
export default function PrintModeWorkspace({assets,config,onConfig,onPreview}:Props){
 const [saved,setSaved]=useState(readModePresets);
 const [name,setName]=useState("My print setup");
 const [presetId,setPresetId]=useState("");
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const chosen=config??DEFAULT_PRINT_MODE;
 const select=(mode:PrintModeId)=>{onConfig(modeDefaults(mode,chosen));setNotice("");setError("");};
 function persist(){
   try{
     if(!name.trim()||name.length>80)throw new Error("Enter a preset name (up to 80 characters).");
     const next=[{id:crypto.randomUUID(),name:name.trim(),config:chosen},...saved].slice(0,40);
     saveModePresets(next);setSaved(next);setPresetId(next[0].id);setNotice("Saved on this device.");setError("");
   }catch(e){setError(e instanceof Error?e.message:"Preset could not be saved.");}
 }
 function apply(){
   const selected=saved.find(x=>x.id===presetId);
   if(!selected)return;
   onConfig(selected.config);setError("");setNotice("Preset applied. Check image assignments before printing.");
 }
 function remove(){
   const next=saved.filter(x=>x.id!==presetId);
   try{saveModePresets(next);setSaved(next);setPresetId("");setNotice("Preset deleted.");setError("");}
   catch(e){setError(e instanceof Error?e.message:"Preset could not be deleted.");}
 }
 return <main className="print-mode-workspace mode-selector" aria-label="Select a print mode">
   <div className="mode-heading">
     <div><div className="mode-eyebrow">PRINTS / Sheet preparation</div>
       <h1>Print Modes</h1>
       <p>Select a production layout. Preview, Images and Print use this same job.</p></div>
   </div>
   <div className="mode-content">
     <section className="mode-selector-content">
       <div className="mode-card-grid">
         {PRINT_MODES.map(mode=><button type="button" key={mode.id}
           className={"mode-card"+(config?.mode===mode.id?" selected":"")}
           aria-pressed={config?.mode===mode.id}
           onClick={()=>select(mode.id)}>
           <span className="mode-card-icon"><StudioIcon name={MODE_ICONS[mode.id]} size={23}/></span>
           <strong>{mode.label}</strong><small>{mode.description}</small>
           <span className="mode-card-check" aria-hidden="true">{config?.mode===mode.id?"✓":""}</span>
         </button>)}
       </div>
       {config&&<>
         <div className="mode-selector-title"><strong>{PRINT_MODES.find(m=>m.id===config.mode)?.label}</strong>
           <span>{assets.length} design{assets.length===1?"":"s"} · Settings carry through to all tabs</span></div>
         <PrintModeSettings config={config} onConfig={onConfig}/>
         <button className="primary-button mode-preview-action" onClick={onPreview}>
           <StudioIcon name="preview" size={17}/>Open shared Preview</button>
       </>}
       <div className="mode-saved-presets">
         <h3>Saved mode presets</h3>
         <div className="mode-field-row">
           <label>Name<input value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></label>
           <label>Saved configuration
             <select value={presetId} onChange={e=>setPresetId(e.target.value)}>
               <option value="">Select a preset</option>
               {saved.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
             </select>
           </label>
         </div>
         <div className="mode-output-actions">
           <button className="secondary-button" onClick={persist}>Save preset</button>
           <button className="secondary-button" disabled={!presetId} onClick={apply}>Apply</button>
           <button className="secondary-button" disabled={!presetId} onClick={remove}>Delete</button>
         </div>
         <p className="hint">Presets stay on this device; job settings are also saved with your project.</p>
       </div>
       {error&&<p className="banner danger" role="alert">{error}</p>}
       {notice&&<p className="banner success" role="status">{notice}</p>}
     </section>
   </div>
 </main>;
}
