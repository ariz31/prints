import {useState} from "react";
import type {FormEvent} from "react";
import type {UserPreferences} from "../core/preferences.ts";
import type {DisplayUnit} from "../core/units.ts";
import type {Orientation} from "../core/layout.ts";
import type {CustomPaperSize} from "../core/paperLibrary.ts";
import {MAX_CUSTOM_PAPERS} from "../core/paperLibrary.ts";
import DimensionField from "./DimensionField.tsx";
import PaperSizePicker from "./PaperSizePicker.tsx";
import StudioIcon from "./StudioIcon.tsx";

export default function PreferencesPanel({preferences,customPapers,onChange,onPaperLibraryChange,onClose}:{
 preferences:UserPreferences;
 customPapers:readonly CustomPaperSize[];
 onChange:(p:UserPreferences)=>void;
 onPaperLibraryChange:(papers:CustomPaperSize[])=>void;
 onClose:()=>void;
}){
 const set=<K extends keyof UserPreferences>(key:K,value:UserPreferences[K])=>onChange({...preferences,[key]:value});
 const [editId,setEditId]=useState("");
 const [name,setName]=useState("");
 const [width,setWidth]=useState("");
 const [height,setHeight]=useState("");
 const [unit,setUnit]=useState<"mm"|"in">("mm");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const factor=unit==="in"?25.4:1;
 const fmt=(value:number)=>Number(value.toFixed(4)).toString();
 function reset(){
   setEditId("");setName("");setWidth("");setHeight("");
   setError("");
 }
 function edit(paper:CustomPaperSize){
   setEditId(paper.id);setName(paper.name);
   setWidth(fmt(paper.widthMm/factor));setHeight(fmt(paper.heightMm/factor));
   setError("");setNotice("");
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
     reset();setNotice(editId?"Paper size updated on this device.":"Paper size saved on this device.");
   }catch(cause){setError(cause instanceof Error?cause.message:"Unable to save the custom size.");}
 }
 function remove(paper:CustomPaperSize){
   if(!window.confirm("Delete “"+paper.name+"” from saved paper sizes? Existing jobs keep their dimensions."))return;
   try{
     onPaperLibraryChange(customPapers.filter(p=>p.id!==paper.id));
     if(editId===paper.id)reset();
     setNotice("Saved paper size deleted. Existing jobs are unchanged.");setError("");
   }catch(cause){setError(cause instanceof Error?cause.message:"Unable to delete the custom size.");}
 }
 return <section className="preferences-panel" aria-label="Print defaults">
  <div className="panel-heading"><h2 className="panel-title-with-icon">
    <StudioIcon name="settings" size={18}/><span>Preferences</span></h2>
    <button aria-label="Close preferences" className="icon-button" onClick={onClose}>
      <StudioIcon name="close" size={18}/></button></div>
  <div className="preferences-grid">
   <label>Units<select value={preferences.unit} onChange={e=>set("unit",e.target.value as DisplayUnit)}>
    <option value="mm">Millimeters</option><option value="cm">Centimeters</option><option value="in">Inches</option>
   </select></label>
   <div className="paper-picker-field"><span>Default paper</span>
     <PaperSizePicker paper={preferences.defaultPaper}
       customWidthMm={preferences.defaultCustomWidthMm??210}
       customHeightMm={preferences.defaultCustomHeightMm??297}
       customPapers={customPapers} label="Default paper"
       onSelect={selection=>onChange({...preferences,defaultPaper:selection.paper,
         defaultCustomWidthMm:selection.customWidthMm,defaultCustomHeightMm:selection.customHeightMm})}/>
   </div>
   <label>Orientation<select value={preferences.defaultOrientation}
     onChange={e=>set("defaultOrientation",e.target.value as Orientation)}>
    <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
   </select></label>
   <DimensionField label="Default margin" unit={preferences.unit} valueMm={preferences.defaultMarginMm}
     minMm={0} maxMm={199.999} onCommit={v=>set("defaultMarginMm",v)}/>
   <DimensionField label="Default gap" unit={preferences.unit} valueMm={preferences.defaultGapMm}
     minMm={0} maxMm={199.999} onCommit={v=>set("defaultGapMm",v)}/>
   <label>Autosave<select value={preferences.autoSave===false?"no":"yes"}
     onChange={e=>set("autoSave",e.target.value==="yes")}>
    <option value="yes">On (saved projects)</option><option value="no">Off</option></select></label>
   <label>Cut lines<select value={preferences.defaultCutGuides?"yes":"no"}
     onChange={e=>set("defaultCutGuides",e.target.value==="yes")}>
    <option value="yes">On</option><option value="no">Off</option></select></label>
  </div>
  <section className="paper-library-section" aria-label="Custom paper sizes">
    <h3>Custom paper sizes ({customPapers.length}/{MAX_CUSTOM_PAPERS})</h3>
    <p className="hint">Create reusable sizes in Settings. They are stored in this browser; print jobs also save their exact dimensions.</p>
    <form className="paper-library-editor" onSubmit={save}>
      <label>Paper name<input value={name} maxLength={60} placeholder="e.g. Half bond"
        onChange={e=>setName(e.target.value)}/></label>
      <label>Measurement<select value={unit} onChange={e=>{
        const next=e.target.value as "mm"|"in";
        if(width.trim()&&Number.isFinite(Number(width)))setWidth(fmt(Number(width)*(unit==="in"?25.4:1)/(next==="in"?25.4:1)));
        if(height.trim()&&Number.isFinite(Number(height)))setHeight(fmt(Number(height)*(unit==="in"?25.4:1)/(next==="in"?25.4:1)));
        setUnit(next);
      }}><option value="mm">Millimeters (mm)</option><option value="in">Inches (in)</option></select></label>
      <div className="paper-library-dimensions">
        <label>Width ({unit})<input type="number" inputMode="decimal" min="0.001"
          step="any" value={width} onChange={e=>setWidth(e.target.value)} required/></label>
        <label>Height ({unit})<input type="number" inputMode="decimal" min="0.001"
          step="any" value={height} onChange={e=>setHeight(e.target.value)} required/></label>
      </div>
      <div className="paper-library-buttons">
        <button className="secondary-button" type="submit">{editId?"Update paper":"Add paper size"}</button>
        {editId&&<button type="button" className="secondary-button" onClick={reset}>Cancel edit</button>}
      </div>
    </form>
    {!!customPapers.length&&<div className="paper-library-list">
      {customPapers.map(p=><div className="paper-library-row" key={p.id}>
        <span><strong>{p.name}</strong><small>{fmt(p.widthMm)} × {fmt(p.heightMm)} mm</small></span>
        <button type="button" onClick={()=>edit(p)} aria-label={"Edit "+p.name}>Edit</button>
        <button type="button" onClick={()=>remove(p)} aria-label={"Delete "+p.name}>Delete</button>
      </div>)}
    </div>}
    {error&&<p className="banner danger" role="alert">{error}</p>}
    {notice&&<p className="banner success" role="status">{notice}</p>}
  </section>
  <p className="hint">Local preferences do not sync between devices. Current job settings are not changed by editing defaults.</p>
 </section>;
}
