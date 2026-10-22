import { useEffect, useId, useRef, useState } from "react";
import StudioIcon from "./StudioIcon.tsx";

/** Click/focus/hover help, dismissible outside or by Escape on small screens. */
export default function HelpTip({text,label="Help"}:{text:string;label?:string}){
 const [open,setOpen]=useState(false);
 const host=useRef<HTMLSpanElement>(null);
 const id=useId();
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{
   if(event.target instanceof Node&&!host.current?.contains(event.target))setOpen(false);
  };
  const escape=(event:KeyboardEvent)=>{
   if(event.key==="Escape")setOpen(false);
  };
  document.addEventListener("pointerdown",outside);
  document.addEventListener("keydown",escape);
  return ()=>{
   document.removeEventListener("pointerdown",outside);
   document.removeEventListener("keydown",escape);
  };
 },[open]);
 return <span ref={host} className="help-tip"
   onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)}>
  <button className="help-trigger" type="button" aria-label={label}
    aria-expanded={open} aria-describedby={open?id:undefined}
    onClick={()=>setOpen(true)} onFocus={()=>setOpen(true)}
    onBlur={event=>{
      if(!event.currentTarget.parentElement?.contains(event.relatedTarget as Node|null))setOpen(false);
    }}>
    <StudioIcon name="help" size={16}/>
  </button>
  {open&&<span id={id} className="help-bubble" role="tooltip">{text}</span>}
 </span>;
}
