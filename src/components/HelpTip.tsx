import { useState } from "react";
import StudioIcon from "./StudioIcon.tsx";
export default function HelpTip({text,label="Help"}:{text:string;label?:string}){
 const [open,setOpen]=useState(false);
 return <span className="help-tip" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)}>
  <button className="help-trigger" type="button" aria-label={label}
    aria-expanded={open} onClick={()=>setOpen(true)}
    onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)}>
    <StudioIcon name="help" size={16}/>
  </button>
  {open&&<span className="help-bubble" role="tooltip">{text}</span>}
 </span>;
}
