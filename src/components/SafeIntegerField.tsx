import {useEffect,useRef,useState} from "react";
import {parseBoundedNumber} from "../core/safeNumbers.ts";

interface Props{
 value:number;min:number;max:number;
 label:string;onCommit:(value:number)=>void;
}
/** Allows temporarily blank/zero drafts without leaking invalid print data. */
export default function SafeIntegerField({value,min,max,label,onCommit}:Props){
 const [draft,setDraft]=useState(String(value));
 const [editing,setEditing]=useState(false);
 const [invalid,setInvalid]=useState(false);
 const skipBlur=useRef(false);
 useEffect(()=>{
   if(!editing)setDraft(String(value));
 },[value,editing]);
 const commit=()=>{
   if(skipBlur.current){skipBlur.current=false;return;}
   const number=parseBoundedNumber(draft,min,max,true);
   setEditing(false);
   if(number===null){
     setInvalid(true);
     setDraft(String(value));
     return;
   }
   setInvalid(false);
   setDraft(String(number));
   if(number!==value)onCommit(number);
 };
 return <label className={"safe-integer-field"+(invalid?" has-error":"")}>
   <span>{label}</span>
   <input type="number" inputMode="numeric" min={min} max={max} step={1}
     aria-label={label} aria-invalid={invalid} value={draft}
     onFocus={()=>{skipBlur.current=false;setEditing(true);}}
     onChange={event=>{setDraft(event.target.value);setInvalid(false);}}
     onBlur={commit}
     onKeyDown={event=>{
       if(event.key==="Enter")event.currentTarget.blur();
       else if(event.key==="Escape"){
         event.preventDefault();skipBlur.current=true;
         setEditing(false);setInvalid(false);setDraft(String(value));
         event.currentTarget.blur();
       }
     }}/>
   {invalid&&<small role="alert">Enter a whole number from {min} to {max}.</small>}
 </label>;
}
