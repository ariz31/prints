import {useEffect,useState} from "react";
import StudioSelect from "./StudioSelect.tsx";
import StudioIcon from "./StudioIcon.tsx";
import type {PhotoAsset} from "../core/exportPdf.ts";
import type {PrintModeConfig} from "../core/printModes.ts";
import {getCutGeometry} from "../core/printModes.ts";
import type {inspectModeImageCoverage} from "../core/printModeAssignments.ts";

type Coverage=ReturnType<typeof inspectModeImageCoverage>;
/** Keeps partially typed mobile-number edits local until they form a valid copy count. */
function DesignCopiesInput({name,value,onCommit}:{
 name:string;value:number;onCommit:(value:number)=>void;
}){
 const [draft,setDraft]=useState(String(value));
 useEffect(()=>setDraft(String(value)),[value]);
 return <label className="mode-per-design-copy">Copies
   <input type="number" inputMode="numeric" min={1} max={1000} step={1}
     aria-label={"Copies of "+name} value={draft}
     onChange={e=>{
       setDraft(e.target.value);
       const n=Number(e.target.value);
       if(e.target.value.trim()!==""&&Number.isSafeInteger(n)&&n>=1&&n<=1000)
         onCommit(n);
     }} onBlur={()=>setDraft(String(value))}/>
 </label>;
}

export default function ModeImageAssignmentControls({assets,config,onConfig,coverage,previews={},compact=false}:{
 assets:readonly PhotoAsset[];config:PrintModeConfig;onConfig:(c:PrintModeConfig)=>void;
 coverage?:Coverage;previews?:Readonly<Record<string,string>>;compact?:boolean;
}){
 const current=assets.find(a=>a.id===config.selectedImageId)??assets[0];
 const basis=config.quantityBasis??"total";
 const [expanded,setExpanded]=useState(false);
 const chosen=new Set(config.imageAssignment==="selected"
   ?(config.includedImageIds??[])
   :config.imageAssignment==="first"?(current?[current.id]:[]):assets.map(a=>a.id));
 const included=coverage?.included??assets.filter(a=>chosen.has(a.id)).length;
 const printed=coverage?.printed;
 const live=new Set(assets.map(a=>a.id));
 const staleIds=config.imageAssignment==="selected"
   ?(config.includedImageIds??[]).filter(id=>!live.has(id))
   :config.imageAssignment==="slots"
     ?[config.selectedImageId,...config.slotImageIds].filter(id=>id&&!live.has(id))
     :config.imageAssignment==="first"&&config.selectedImageId&&!live.has(config.selectedImageId)
       ?[config.selectedImageId]:[];
 const repairMissing=()=>{
   onConfig({...config,
     selectedImageId:config.selectedImageId&&!live.has(config.selectedImageId)
       ?(assets[0]?.id??""):config.selectedImageId,
     includedImageIds:(config.includedImageIds??[]).filter(id=>live.has(id)),
     slotImageIds:config.slotImageIds.map(id=>live.has(id)?id:""),
   });
 };
 let grid:ReturnType<typeof getCutGeometry>|null=null;
 try{if(config.mode==="ticket")grid=getCutGeometry(config);}catch{/* Invalid settings appear in Preview. */}
 const assign=(value:PrintModeConfig["imageAssignment"])=>onConfig({...config,
   imageAssignment:value,
   ...(value==="selected"?{includedImageIds:config.imageAssignment==="selected"
     ?(config.includedImageIds??[]):assets.map(a=>a.id)}:{}),
   ...(value==="slots"?{quantityBasis:"total" as const}:{})});
 const includeAll=()=>onConfig({...config,imageAssignment:"cycle",quantityBasis:"per-design",
   perImageQuantities:Object.fromEntries(assets.map(a=>[a.id,1]))});
 const toggle=(id:string,on:boolean)=>{
   const ids=new Set(config.includedImageIds??[]);
   if(on)ids.add(id);else ids.delete(id);
   onConfig({...config,includedImageIds:assets.filter(a=>ids.has(a.id)).map(a=>a.id)});
 };
 return <section className={"mode-inline-assignments mode-assignment-panel"+(compact?" compact":"")}
   aria-label="Print mode image assignment">
   <div className="mode-assignment-heading"><strong>Print images</strong>
     <span role="status">{assets.length} uploaded · {included} included · {printed??"—"} printed</span></div>
   <div className="mode-field-row mode-assignment-selectors">
     <label>Image assignment
       <StudioSelect value={config.imageAssignment} onChange={e=>assign(e.target.value as PrintModeConfig["imageAssignment"])}>
         <option value="cycle">All uploaded designs</option>
         <option value="selected">Selected designs only</option>
         <option value="first">Repeat one design</option>
         {config.mode==="ticket"&&<option value="slots">Assign each cutting position</option>}
       </StudioSelect>
     </label>
     <label>Quantity rule
       <StudioSelect value={basis} disabled={config.imageAssignment==="slots"}
         onChange={e=>onConfig({...config,quantityBasis:e.target.value as "total"|"per-design"})}>
         <option value="total">Total finished pieces</option>
         <option value="per-design">Copies per design</option>
       </StudioSelect>
     </label>
   </div>
   {(config.imageAssignment==="first"||config.imageAssignment==="slots")&&<label>Source design
     <StudioSelect value={config.selectedImageId||current?.id||""}
       onChange={e=>onConfig({...config,selectedImageId:e.target.value})}>
       {config.selectedImageId&&!assets.some(a=>a.id===config.selectedImageId)&&
         <option value={config.selectedImageId} disabled>Missing design — reselect</option>}
       {!assets.length&&<option value="">Add a design first</option>}
       {assets.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
     </StudioSelect>
   </label>}
   {staleIds.length>0&&<div className="mode-coverage-notice warning" role="alert">
      {staleIds.length} saved image assignment{staleIds.length===1?" is":"s are"} unavailable.
      <button type="button" className="secondary-button" onClick={repairMissing}>
        Remove missing image assignments</button>
   </div>}
   {assets.length>1&&config.imageAssignment!=="cycle"&&<button className="secondary-button mode-include-all"
     type="button" onClick={includeAll}><StudioIcon name="images" size={15}/>Include all {assets.length} designs</button>}
   {assets.length>0&&config.imageAssignment!=="slots"&&<div className="mode-assignments-details">
     <button className="mode-details-toggle" type="button" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>
       <StudioIcon name="images" size={16}/>Designs and copies · {included}/{assets.length}
       <StudioIcon name="chevron" size={15}/>
     </button>
     {expanded&&<div className="mode-assignment-list">
       {assets.map(a=>{
         const active=chosen.has(a.id);
         return <div className={"mode-assignment-item"+(active?"":" excluded")} key={a.id}>
           <img src={previews[a.id]??a.processedUrl??a.url} alt="" loading="lazy" width={44} height={44}/>
           {config.imageAssignment==="selected"?<label className="mode-assignment-check">
             <input type="checkbox" checked={active} onChange={e=>toggle(a.id,e.target.checked)}/>
             <span title={a.name}>{a.name}</span>
           </label>:<span className="mode-assignment-name" title={a.name}>{a.name}</span>}
           {basis==="per-design"&&active&&<DesignCopiesInput name={a.name}
             value={config.perImageQuantities?.[a.id]??1}
             onCommit={n=>onConfig({...config,
               // Reused presets can refer to images from other projects.
               // Keep copy mappings only for the active project's stable IDs.
               perImageQuantities:{...Object.fromEntries(
                 Object.entries(config.perImageQuantities??{}).filter(([id])=>assets.some(item=>item.id===id))
               ),[a.id]:n}})}/>} 
           {!active&&<small className="mode-excluded-tag">Excluded</small>}
         </div>;
       })}
     </div>}
   </div>}
   {coverage?.omitted.length?<p className={"mode-coverage-notice"+(coverage.unintended.length?" warning":"")} role="status">
      {coverage.omitted.length} design{coverage.omitted.length===1?" is":"s are"} not included in the print sheets.
      {coverage.unintended.length>0
       ?" Increase finished pieces or select Copies per design to include each image."
       :" This follows your current selection."}
     </p>:null}
   {config.mode==="ticket"&&config.imageAssignment==="slots"&&grid&&<fieldset className="mode-position-assignments">
     <legend>Design per cutting position</legend>
     {Array.from({length:grid.perSheet},(_,slot)=><label key={slot}>Cut position {slot+1}
       <StudioSelect value={config.slotImageIds[slot]||""} onChange={e=>{
         const ids=[...config.slotImageIds];ids[slot]=e.target.value;
         onConfig({...config,slotImageIds:ids});
       }}>
         <option value="">Default design</option>
         {config.slotImageIds[slot]&&!assets.some(a=>a.id===config.slotImageIds[slot])&&
           <option value={config.slotImageIds[slot]} disabled>Missing design — reassign</option>}
         {assets.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
       </StudioSelect>
     </label>)}
   </fieldset>}
 </section>;
}
