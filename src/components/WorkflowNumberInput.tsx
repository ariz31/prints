import {useEffect,useState} from "react";
import {parseBoundedNumber,workflowParameterBounds} from "../core/safeNumbers.ts";
interface Props {name:string;value:number;onCommit:(value:number)=>void}
/** Zero is accepted for offsets/margins but rejected for physical sizes/copies. */
export default function WorkflowNumberInput({name,value,onCommit}:Props){
 const {min,max,integer}=workflowParameterBounds(name);
 const [draft,setDraft]=useState(String(value));
 const [editing,setEditing]=useState(false);
 const [invalid,setInvalid]=useState(false);
 useEffect(()=>{if(!editing)setDraft(String(value));},[value,editing]);
 function commit(){
   const next=parseBoundedNumber(draft,min,max,integer);
   setEditing(false);
   if(next===null){
     setInvalid(true);
     setDraft(String(value));
     return;
   }
   setInvalid(false);
   setDraft(String(next));
   if(next!==value)onCommit(next);
 }
 return <label className={"workflow-number"+(invalid?" has-error":"")}>{name}
   <input type="number" inputMode="decimal" step={integer?1:"any"}
     min={min} max={max} value={draft} aria-invalid={invalid}
     onFocus={()=>setEditing(true)}
     onChange={e=>{setDraft(e.target.value);setInvalid(false);}}
     onBlur={commit}
     onKeyDown={e=>{
       if(e.key==="Enter")e.currentTarget.blur();
       if(e.key==="Escape"){
         setEditing(false);setInvalid(false);setDraft(String(value));
         e.currentTarget.blur();
       }
     }}/>
   {invalid&&<small role="alert">Enter a valid {name} from {min} to {max}.</small>}
 </label>;
}
