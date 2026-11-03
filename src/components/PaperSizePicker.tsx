import StudioSelect from "./StudioSelect.tsx";
import {PAPER_GROUPS,PAPER_SIZES} from "../core/layout.ts";
import type {PaperName} from "../core/layout.ts";
import type {CustomPaperSize} from "../core/paperLibrary.ts";
import {samePaperSize} from "../core/paperLibrary.ts";
export interface PaperSelection{
 paper:PaperName;customWidthMm:number;customHeightMm:number;
}
interface Props extends PaperSelection{
 customPapers:readonly CustomPaperSize[];
 onSelect:(value:PaperSelection)=>void;
 label?:string;
}
const fmt=(n:number)=>Number(n.toFixed(3)).toString();
const measure=(w:number,h:number)=>fmt(w)+" × "+fmt(h)+" mm";
/** Paper is a configured StudioSelect: all selection controls share one UI. */
export default function PaperSizePicker({paper,customWidthMm,customHeightMm,customPapers,onSelect,label="Paper size"}:Props){
 const selectedPaper=paper==="Custom"
   ?customPapers.find(p=>samePaperSize(p,{widthMm:customWidthMm,heightMm:customHeightMm}))
   :undefined;
 const selectedValue=paper!=="Custom"?paper:selectedPaper?"custom:"+selectedPaper.id:"manual";
 function choose(value:string){
   if(value==="manual"){onSelect({paper:"Custom",customWidthMm:customWidthMm||210,
      customHeightMm:customHeightMm||297});return;}
   const saved=customPapers.find(p=>"custom:"+p.id===value);
   if(saved){onSelect({paper:"Custom",customWidthMm:saved.widthMm,customHeightMm:saved.heightMm});return;}
   if(Object.prototype.hasOwnProperty.call(PAPER_SIZES,value))
     onSelect({paper:value as PaperName,customWidthMm,customHeightMm});
 }
 return <StudioSelect value={selectedValue} aria-label={label} searchable
   onChange={e=>choose(e.target.value)}>
   {PAPER_GROUPS.map(group=><optgroup key={group.label} label={group.label}>
     {group.papers.map(name=><option key={name} value={name}>
       {name} · {measure(PAPER_SIZES[name].widthMm,PAPER_SIZES[name].heightMm)}
     </option>)}
   </optgroup>)}
   {!!customPapers.length&&<optgroup label="Saved custom sizes">
     {customPapers.map(saved=><option key={saved.id} value={"custom:"+saved.id}>
       {saved.name} · {measure(saved.widthMm,saved.heightMm)}
     </option>)}
   </optgroup>}
   <optgroup label="Manual entry">
     <option value="manual">Custom dimensions… · {measure(customWidthMm,customHeightMm)}</option>
   </optgroup>
 </StudioSelect>;
}
