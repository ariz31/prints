import {useEffect,useState} from "react";
import {parseBoundedNumber} from "../core/safeNumbers.ts";

interface Props {
 label:string;
 value:number;
 min:number;
 max:number;
 onCommit:(value:number)=>void;
 integer?:boolean;
 step?:number|"any";
}
/**
 * Stage user edits instead of converting empty strings to zero. A zero coordinate
 * is valid when min=0; dimensions/font sizes can require a strictly positive min.
 */
export default function BoundedNumberField({
 label,value,min,max,onCommit,integer=false,step=1,
}:Props){
 const [draft,setDraft]=useState(String(value));
 const [editing,setEditing]=useState(false);
 const [invalid,setInvalid]=useState(false);
 useEffect(()=>{
   if(!editing)setDraft(String(value));
 },[value,editing]);
 const commit=()=>{
   const parsed=parseBoundedNumber(draft,min,max,integer);
   setEditing(false);
   if(parsed===null){
     setInvalid(true);
     setDraft(String(value));
     return;
   }
   setInvalid(false);
   setDraft(String(parsed));
   if(parsed!==value)onCommit(parsed);
 };
 return <label className={"bounded-number-field"+(invalid?" has-error":"")}>
   <span>{label}</span>
   <input type="number" inputMode={integer?"numeric":"decimal"} min={min} max={max}
     step={step} value={draft} aria-label={label} aria-invalid={invalid}
     onFocus={()=>setEditing(true)}
     onChange={event=>{setDraft(event.target.value);setInvalid(false);}}
     onBlur={commit}
     onKeyDown={event=>{
       if(event.key==="Enter")event.currentTarget.blur();
       else if(event.key==="Escape"){
         setEditing(false);setInvalid(false);
         setDraft(String(value));event.currentTarget.blur();
       }
     }}/>
   {invalid&&<small role="alert">Enter a number from {min} to {max}.</small>}
 </label>;
}
