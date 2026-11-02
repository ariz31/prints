import {useEffect,useState} from "react";
import {parsePhotoAdjustmentNumber,resolvePhotoAdjustmentNumber} from "../core/photoAdjustmentNumber.ts";
import StudioIcon from "./StudioIcon.tsx";

interface Props{
 id:string;label:string;ariaLabel?:string;value:number;min:number;max:number;
 resetValue:number;onChange:(value:number)=>void;hint?:string;
}
/** A single compact, accessible row on desktop, tablet and phone.
 * Typing intermediate values does not mutate the print job; valid integral
 * numbers synchronize with the slider immediately. Invalid entries roll back
 * on blur or Enter, never coercing an empty field to zero. */
export default function PhotoAdjustmentRow({
 id,label,ariaLabel,value,min,max,resetValue,onChange,hint,
}:Props){
 const [entry,setEntry]=useState(String(value));
 const [editing,setEditing]=useState(false);
 useEffect(()=>{if(!editing)setEntry(String(value));},[value,editing]);
 const name=ariaLabel??label;
 function finish(raw:string){
  const next=resolvePhotoAdjustmentNumber(raw,value,min,max);
  setEntry(String(next));
  setEditing(false);
  if(next!==value)onChange(next);
 }
 const validEntry=parsePhotoAdjustmentNumber(entry,min,max)!==null;
 return <div className="photo-adjust-control photo-adjust-row" title={hint}>
  <label htmlFor={id} title={label}>{label}</label>
  <input id={id} type="range" aria-label={name}
   min={min} max={max} step={1} value={value} onChange={event=>{
    const next=parsePhotoAdjustmentNumber(event.target.value,min,max);
    if(next!==null)onChange(next);
   }}/>
  <input className="photo-adjust-value" type="number" inputMode={min<0?"decimal":"numeric"}
   aria-label={name+" value"} aria-invalid={!validEntry} autoComplete="off"
   min={min} max={max} step={1} value={entry}
   onFocus={event=>{setEditing(true);event.currentTarget.select();}}
   onChange={event=>{
    const raw=event.currentTarget.value;
    setEntry(raw);
    const next=parsePhotoAdjustmentNumber(raw,min,max);
    if(next!==null&&next!==value)onChange(next);
   }}
   onBlur={event=>finish(event.currentTarget.value)}
   onKeyDown={event=>{
    if(event.key==="Enter")event.currentTarget.blur();
    else if(event.key==="Escape"){
     event.currentTarget.value=String(value);
     setEntry(String(value));
     event.currentTarget.blur();
    }
   }}/>
  <button type="button" className="photo-studio-reset"
   aria-label={"Reset "+label} disabled={value===resetValue}
   onClick={()=>onChange(resetValue)}><StudioIcon name="reset" size={14}/></button>
 </div>;
}
