import { useEffect,useState } from "react";
import type { DisplayUnit } from "../core/units.ts";
import { formatLength,parseLength } from "../core/units.ts";

interface Props{
 valueMm:number;unit:DisplayUnit;onCommit:(mm:number)=>void;
 label:string;title?:string;minMm?:number;
}
export default function DimensionField({valueMm,unit,onCommit,label,title,minMm=0.01}:Props){
 const [text,setText]=useState(()=>formatLength(valueMm,unit));
 const [editing,setEditing]=useState(false);
 const [invalid,setInvalid]=useState(false);
 useEffect(()=>{
  if(!editing){setText(formatLength(valueMm,unit));setInvalid(false);}
 },[valueMm,unit,editing]);
 const commit=()=>{
  const mm=parseLength(text,unit);
  if(mm===null||mm<minMm){setInvalid(true);return;}
  onCommit(mm);setEditing(false);setInvalid(false);setText(formatLength(mm,unit));
 };
 return <label title={title} className={"dimension-field"+(invalid?" has-error":"")}>
   <span>{label} <small>{unit}</small></span>
   <input type="text" inputMode="decimal" value={text} aria-invalid={invalid}
    aria-label={label+" in "+unit+" (other units also accepted)"}
    onFocus={()=>setEditing(true)} onChange={e=>{setText(e.target.value);setInvalid(false);}}
    onBlur={commit} onKeyDown={e=>{if(e.key==="Enter"){e.currentTarget.blur();}else if(e.key==="Escape"){
      setEditing(false);setInvalid(false);setText(formatLength(valueMm,unit));e.currentTarget.blur();
    }}}/>
   {invalid&&<small role="alert">Use a positive length, e.g. 1&quot; or 25.4mm</small>}
 </label>;
}
