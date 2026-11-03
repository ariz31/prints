import {useEffect,useState} from "react";
import StudioSelect from "./StudioSelect.tsx";
import {DPI_PRESETS,MIN_EXPORT_DPI,MAX_EXPORT_DPI,isPresetDpi,validExportDpi} from "../core/dpi.ts";

interface Props{value:number;onChange:(value:number)=>void;disabled?:boolean}
const INITIAL_CUSTOM_DPI=375;
/** One resolution control for mode settings and exports; no fictitious DPI choices. */
export default function DpiSelect({value,onChange,disabled=false}:Props){
 const custom=!isPresetDpi(value);
 const [draft,setDraft]=useState(String(custom?value:INITIAL_CUSTOM_DPI));
 const [invalid,setInvalid]=useState(false);
 useEffect(()=>{if(custom){setDraft(String(value));setInvalid(false);}},[value,custom]);
 function choose(selected:string){
   if(selected==="custom"){
     const n=Number(draft);
     onChange(validExportDpi(n)&&!isPresetDpi(n)?n:INITIAL_CUSTOM_DPI);
   }else{
     const n=Number(selected);
     if(validExportDpi(n))onChange(n);
   }
   setInvalid(false);
 }
 return <div className="dpi-selector">
   <StudioSelect value={custom?"custom":String(value)} aria-label="Export resolution"
     disabled={disabled} onChange={event=>choose(event.target.value)}>
     <optgroup label="Standard resolutions">
       {DPI_PRESETS.map(p=><option value={p.value} key={p.value}>
         {p.label} · {p.detail}
       </option>)}
     </optgroup>
     <optgroup label="Custom">
       <option value="custom">Custom DPI · {custom?value+" DPI":"Enter a resolution"}</option>
     </optgroup>
   </StudioSelect>
   {custom&&<div className="dpi-custom-entry">
     <span>Custom DPI</span>
     <input type="number" inputMode="numeric" min={MIN_EXPORT_DPI}
       max={MAX_EXPORT_DPI} step={1} value={draft} disabled={disabled}
       aria-label="Custom export DPI" aria-invalid={invalid}
       onChange={event=>{
         const raw=event.target.value;setDraft(raw);
         const n=Number(raw);
         if(raw.trim()!==""&&validExportDpi(n)){onChange(n);setInvalid(false);}
         else setInvalid(true);
       }}
       onBlur={()=>{
         if(!validExportDpi(Number(draft))||draft.trim()===""){
           setDraft(String(value));setInvalid(false);
         }
       }}/>
     {invalid&&<small role="status">Use a whole number from 72 to 1200.</small>}
   </div>}
 </div>;
}
