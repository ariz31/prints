import {useState} from "react";
import type {FormEvent} from "react";
import type {CustomPaperSize} from "../core/paperLibrary.ts";
import {MAX_CUSTOM_PAPERS} from "../core/paperLibrary.ts";
import StudioSelect from "./StudioSelect.tsx";

interface Props{
 customPapers:readonly CustomPaperSize[];
 onPaperLibraryChange:(papers:CustomPaperSize[])=>void;
 /** Allows direct navigation into the paper manager; normally collapsed. */
 initiallyOpen?:boolean;
}
const fmt=(value:number)=>Number(value.toFixed(4)).toString();

/** Opt-in editor: keeps mobile Preferences compact until paper management is needed. */
export default function CustomPaperManager({customPapers,onPaperLibraryChange,initiallyOpen=false}:Props){
 const [open,setOpen]=useState(initiallyOpen);
 const [editing,setEditing]=useState(initiallyOpen&&customPapers.length===0);
 const [editId,setEditId]=useState("");
 const [name,setName]=useState("");
 const [width,setWidth]=useState("");
 const [height,setHeight]=useState("");
 const [unit,setUnit]=useState<"mm"|"in">("mm");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const factor=unit==="in"?25.4:1;
 function clearEditor(){
   setEditId("");setName("");setWidth("");setHeight("");
   setEditing(false);setError("");
 }
 function beginAdd(){clearEditor();setNotice("");setOpen(true);setEditing(true);}
 function beginEdit(paper:CustomPaperSize){
   setEditId(paper.id);setName(paper.name);
   setWidth(fmt(paper.widthMm/factor));setHeight(fmt(paper.heightMm/factor));
   setEditing(true);setOpen(true);setNotice("");setError("");
 }
 function save(event:FormEvent<HTMLFormElement>){
   event.preventDefault();setError("");setNotice("");
   try{
     const title=name.trim();
     const w=Number(width)*factor,h=Number(height)*factor;
     if(!title||title.length>60)throw new Error("Name must be 1–60 characters.");
     if(!width.trim()||!height.trim()||![w,h].every(v=>Number.isFinite(v)&&v>0&&v<=2000))
       throw new Error("Enter both dimensions, greater than 0 and at most 2000 mm.");
     const entry={id:editId||crypto.randomUUID(),name:title,widthMm:Number(w.toFixed(4)),heightMm:Number(h.toFixed(4))};
     const next=editId?customPapers.map(p=>p.id===editId?entry:p):[...customPapers,entry];
     onPaperLibraryChange(next);
     const wasEditing=!!editId;
     clearEditor();
     setNotice(wasEditing?"Paper size updated on this device.":"Paper size saved on this device.");
   }catch(cause){setError(cause instanceof Error?cause.message:"Unable to save the custom size.");}
 }
 function remove(paper:CustomPaperSize){
   if(!window.confirm("Delete “"+paper.name+"” from saved paper sizes? Existing jobs keep their dimensions."))return;
   try{
     onPaperLibraryChange(customPapers.filter(p=>p.id!==paper.id));
     if(editId===paper.id)clearEditor();
     setNotice("Saved paper size deleted. Existing jobs are unchanged.");setError("");
   }catch(cause){setError(cause instanceof Error?cause.message:"Unable to delete the custom size.");}
 }
 return <section className="paper-library-section" aria-label="Custom paper sizes">
   <button type="button" className="paper-library-toggle" aria-expanded={open}
     aria-controls="custom-paper-manager"
     onClick={()=>{
       if(open){setOpen(false);return;}
       setOpen(true);
       if(customPapers.length===0&&!editing)setEditing(true);
     }}>
     <span className="paper-library-toggle-copy">
       <strong>Custom paper sizes <span className="paper-library-count">({customPapers.length}/{MAX_CUSTOM_PAPERS})</span></strong>
       <small>{open?"Saved on this device":"Manage saved sizes"}</small>
     </span>
     <span className="paper-library-chevron" aria-hidden="true">{open?"⌃":"⌄"}</span>
   </button>
   {open&&<div id="custom-paper-manager" className="paper-library-content">
     {!editing&&<div className="paper-library-actions">
       <span className="paper-library-note">Presets stay on this device; existing jobs keep their dimensions.</span>
       <button type="button" className="secondary-button" onClick={beginAdd}
         disabled={customPapers.length>=MAX_CUSTOM_PAPERS}>+ Add size</button>
     </div>}
     {editing&&<form className="paper-library-editor" onSubmit={save}>
       <div className="paper-library-form-heading">
         <strong>{editId?"Edit paper size":"New paper size"}</strong>
         <button type="button" aria-label="Cancel paper editing" className="paper-library-cancel" onClick={clearEditor}>Cancel</button>
       </div>
       <div className="paper-library-top-row">
         <label>Paper name<input value={name} maxLength={60} placeholder="e.g. Half bond"
           onChange={e=>setName(e.target.value)} required/></label>
         <label>Units<StudioSelect value={unit} aria-label="Custom paper units" onChange={e=>{
           const next=e.target.value as "mm"|"in";
           if(width.trim()&&Number.isFinite(Number(width)))setWidth(fmt(Number(width)*factor/(next==="in"?25.4:1)));
           if(height.trim()&&Number.isFinite(Number(height)))setHeight(fmt(Number(height)*factor/(next==="in"?25.4:1)));
           setUnit(next);
         }}><option value="mm">mm · Millimeters</option><option value="in">in · Inches</option></StudioSelect></label>
       </div>
       <div className="paper-library-dimensions">
         <label>Width ({unit})<input type="number" inputMode="decimal" min="0.001"
           step="any" placeholder={unit==="mm"?"210":"8.27"} value={width}
           onChange={e=>setWidth(e.target.value)} required/></label>
         <label>Height ({unit})<input type="number" inputMode="decimal" min="0.001"
           step="any" placeholder={unit==="mm"?"297":"11.69"} value={height}
           onChange={e=>setHeight(e.target.value)} required/></label>
       </div>
       <div className="paper-library-buttons">
         <button className="secondary-button" type="submit">{editId?"Update paper":"Add paper size"}</button>
       </div>
     </form>}
     {!!customPapers.length&&<div className="paper-library-list" aria-label="Saved custom paper sizes">
       {customPapers.map(p=><div className="paper-library-row" key={p.id}>
         <span><strong>{p.name}</strong><small>{fmt(p.widthMm)} × {fmt(p.heightMm)} mm</small></span>
         <button type="button" onClick={()=>beginEdit(p)} aria-label={"Edit "+p.name}>Edit</button>
         <button type="button" onClick={()=>remove(p)} aria-label={"Delete "+p.name}>Delete</button>
       </div>)}
     </div>}
     {error&&<p className="banner danger" role="alert">{error}</p>}
     {notice&&<p className="paper-library-feedback" role="status">{notice}</p>}
   </div>}
 </section>;
}
