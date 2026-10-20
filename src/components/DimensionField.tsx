import { useEffect,useRef,useState } from "react";
import type { DisplayUnit } from "../core/units.ts";
import { formatLength,parseLength } from "../core/units.ts";

interface Props{
 valueMm:number;unit:DisplayUnit;onCommit:(mm:number)=>void;
 label:string;title?:string;minMm?:number;maxMm?:number;
}
export default function DimensionField({valueMm,unit,onCommit,label,title,minMm=0.01,maxMm=2000}:Props){
 const [text,setText]=useState(()=>formatLength(valueMm,unit));
 const [editing,setEditing]=useState(false);
 const [invalid,setInvalid]=useState(false);
 const skipBlur=useRef(false);
 useEffect(()=>{
  if(!editing)setText(formatLength(valueMm,unit));
 },[valueMm,unit,editing]);
 const commit=()=>{
  if(skipBlur.current){skipBlur.current=false;return;}
  const mm=parseLength(text,unit);
  if(mm===null||mm<minMm||mm>maxMm){
    setEditing(false);setInvalid(true);setText(formatLength(valueMm,unit));return;
  }
  onCommit(mm);setEditing(false);setInvalid(false);setText(formatLength(mm,unit));
 };
 return <label title={title} className={"dimension-field"+(invalid?" has-error":"")}>
   <span>{label} <small>{unit}</small></span>
   <input type="text" inputMode="decimal" value={text} aria-invalid={invalid}
    aria-label={label+" in "+unit+" (other units also accepted)"}
    onFocus={()=>{skipBlur.current=false;setEditing(true);}} onChange={e=>{setText(e.target.value);setInvalid(false);}}
    onBlur={commit} onKeyDown={e=>{if(e.key==="Enter"){e.currentTarget.blur();}else if(e.key==="Escape"){
      e.preventDefault();skipBlur.current=true;
      setEditing(false);setInvalid(false);setText(formatLength(valueMm,unit));e.currentTarget.blur();
    }}}/>
   {invalid&&<small role="alert">Enter a valid length from {formatLength(minMm,unit)} to {formatLength(maxMm,unit)} {unit}.</small>}
 </label>;
}
