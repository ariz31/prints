import {Children,Fragment,isValidElement,useEffect,useRef,useState} from "react";
import type {ReactNode,ReactElement,KeyboardEvent as ReactKeyboardEvent} from "react";
import {createPortal} from "react-dom";
import {paperPickerBounds} from "../core/paperPickerGeometry.ts";

export interface StudioSelectEvent {target:{value:string}}
interface StudioSelectProps{
 value:string|number;
 onChange:(event:StudioSelectEvent)=>void;
 children:ReactNode;
 disabled?:boolean;
 searchable?:boolean;
 className?:string;
 title?:string;
 name?:string;
 id?:string;
 "aria-label"?:string;
 "aria-invalid"?:boolean;
}
interface Option{value:string;label:string;description?:string;group?:string;disabled:boolean}
interface NodeProps{value?:string|number;label?:string;disabled?:boolean;children?:ReactNode}
function plainText(node:ReactNode):string{
 if(node===null||node===undefined||typeof node==="boolean")return "";
 if(typeof node==="string"||typeof node==="number")return String(node);
 if(Array.isArray(node))return node.map(plainText).join("");
 if(isValidElement(node))return plainText((node as ReactElement<NodeProps>).props.children);
 return "";
}
export function flattenStudioOptions(children:ReactNode):Option[]{
 const result:Option[]=[];
 const walk=(nodes:ReactNode,group?:string,parentDisabled=false)=>{
   Children.forEach(nodes,child=>{
     if(!isValidElement<NodeProps>(child))return;
     if(child.type===Fragment){
       walk(child.props.children,group,parentDisabled);return;
     }
     if(child.type==="optgroup"){
       walk(child.props.children,child.props.label??group,parentDisabled||!!child.props.disabled);return;
     }
     if(child.type!=="option")return;
     const text=plainText(child.props.children).replace(/\s+/g," ").trim();
     const divider=text.indexOf(" · ");
     result.push({value:String(child.props.value??text),
       label:divider<0?text:text.slice(0,divider),
       description:divider<0?undefined:text.slice(divider+3),
       group,disabled:parentDisabled||!!child.props.disabled});
   });
 };
 walk(children);
 return result;
}
/** Shared option UI, styled and positioned identically to the original Paper picker. */
export default function StudioSelect({value,onChange,children,disabled=false,searchable,
 className="",title,name,id,...rest}:StudioSelectProps){
 const [open,setOpen]=useState(false);
 const [search,setSearch]=useState("");
 const [position,setPosition]=useState({top:0,left:0,width:280,maxHeight:280});
 const trigger=useRef<HTMLButtonElement>(null);
 const popup=useRef<HTMLDivElement>(null);
 const input=useRef<HTMLInputElement>(null);
 const keyboardOpen=useRef<"first"|"last"|null>(null);
 const options=flattenStudioOptions(children);
 const selected=options.find(opt=>opt.value===String(value));
 const allowSearch=searchable??options.length>8;
 const titleText=rest["aria-label"]??title??"Select option";
 const close=()=>{setOpen(false);setSearch("");};
 const reposition=()=>{
   const rect=trigger.current?.getBoundingClientRect();if(!rect)return;
   const visual=window.visualViewport;
   const mobile=window.matchMedia?.("(max-width: 899px)").matches??false;
   // Keep the fixed bottom navigation usable while the list is visible.
   const viewportHeight=(visual?.height??window.innerHeight)-(mobile?72:0);
   const bounds=paperPickerBounds(rect,{
     width:visual?.width??window.innerWidth,height:Math.max(100,viewportHeight),
     offsetTop:visual?.offsetTop??0,offsetLeft:visual?.offsetLeft??0,
   },mobile?270:320);
   setPosition(bounds);
 };
 useEffect(()=>{
   if(!open)return;
   if(keyboardOpen.current){
     const items=popup.current?.querySelectorAll<HTMLButtonElement>(".paper-size-option:not(:disabled)");
     const target=keyboardOpen.current==="last"?items?.[items.length-1]:items?.[0];
     target?.focus({preventScroll:true});
     keyboardOpen.current=null;
   }else if(!(window.matchMedia?.("(pointer: coarse)").matches??false)){
     if(allowSearch)input.current?.focus({preventScroll:true});
     else popup.current?.querySelector<HTMLButtonElement>(
       ".paper-size-option.selected:not(:disabled), .paper-size-option:not(:disabled)"
     )?.focus({preventScroll:true});
   }
   function outside(event:PointerEvent){
     if(!popup.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))close();
   }
   // A native select closes when the keyboard tabs to the next field. Because
   // the options live in a portal, pointer-only outside detection misses this.
   function focusOutside(event:FocusEvent){
     const target=event.target;
     if(target instanceof Node &&
       !popup.current?.contains(target)&&!trigger.current?.contains(target))
       close();
   }
   function key(event:KeyboardEvent){
     if(event.key==="Escape"){event.preventDefault();close();trigger.current?.focus({preventScroll:true});}
   }
   function shifted(event:Event){
     if(event.type==="scroll"&&popup.current?.contains(event.target as Node))return;
     reposition();
   }
   document.addEventListener("pointerdown",outside);
   document.addEventListener("focusin",focusOutside);
   document.addEventListener("keydown",key);
   window.addEventListener("resize",shifted);
   window.addEventListener("scroll",shifted,true);
   window.visualViewport?.addEventListener("resize",shifted);
   window.visualViewport?.addEventListener("scroll",shifted);
   return()=>{
     document.removeEventListener("pointerdown",outside);
     document.removeEventListener("focusin",focusOutside);
     document.removeEventListener("keydown",key);
     window.removeEventListener("resize",shifted);
     window.removeEventListener("scroll",shifted,true);
     window.visualViewport?.removeEventListener("resize",shifted);
     window.visualViewport?.removeEventListener("scroll",shifted);
   };
 // Intentional: position recalculated from viewport event, not every render.
 },[open,allowSearch]);
 useEffect(()=>{if(disabled&&open)close();},[disabled,open]);
 const choose=(opt:Option)=>{
   if(opt.disabled)return;
   onChange({target:{value:opt.value}});
   close();trigger.current?.focus({preventScroll:true});
 };
 const visible=options.filter(opt=>(opt.label+" "+(opt.description??"")+" "+(opt.group??""))
   .toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 const move=(e:ReactKeyboardEvent<HTMLButtonElement>)=>{
   if(!["ArrowDown","ArrowUp","Home","End"].includes(e.key))return;
   const nodes=Array.from(popup.current?.querySelectorAll<HTMLButtonElement>(".paper-size-option:not(:disabled)")??[]);
   if(!nodes.length)return;
   e.preventDefault();
   const at=nodes.indexOf(e.currentTarget);
   const index=e.key==="Home"?0:e.key==="End"?nodes.length-1:
     (at+(e.key==="ArrowDown"?1:-1)+nodes.length)%nodes.length;
   nodes[index]?.focus({preventScroll:true});
   nodes[index]?.scrollIntoView({block:"nearest"});
 };
 const groups:{name:string;entries:Option[]}[]=[];
 for(const opt of visible){
   const label=opt.group??"";
   let group=groups.find(x=>x.name===label);
   if(!group){group={name:label,entries:[]};groups.push(group);}
   group.entries.push(opt);
 }
 return <div className={"paper-size-picker studio-select "+className} data-studio-select="">
   <button type="button" ref={trigger} id={id} title={title} name={name} disabled={disabled}
     className="paper-size-picker-button" data-value={String(value)} aria-label={rest["aria-label"]??title}
     aria-haspopup="dialog" aria-expanded={open} aria-invalid={rest["aria-invalid"]}
     onClick={()=>{if(open)close();else{reposition();setSearch("");setOpen(true);}}}
     onKeyDown={event=>{
       if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
       event.preventDefault();
       keyboardOpen.current=event.key==="ArrowUp"||event.key==="End"?"last":"first";
       if(!open){reposition();setSearch("");setOpen(true);}
       else{
         const items=popup.current?.querySelectorAll<HTMLButtonElement>(".paper-size-option:not(:disabled)");
         (keyboardOpen.current==="last"?items?.[items.length-1]:items?.[0])?.focus({preventScroll:true});
         keyboardOpen.current=null;
       }
     }}>
     <span><strong>{selected?.label??"Choose…"}</strong>
       {selected?.description&&<small>{selected.description}</small>}</span>
     <span className="paper-picker-chevron" aria-hidden="true">⌄</span>
   </button>
   {/* A modal <dialog> makes document.body descendants inert. The popover
        must live in the same top-layer dialog to accept selection taps. */}
   {open&&typeof document!=="undefined"&&createPortal(
     <div ref={popup} role="dialog" aria-label={titleText+" options"}
       className="paper-size-picker-panel studio-select-panel" style={position}>
       {allowSearch&&<div className="paper-picker-search">
         <input ref={input} type="search" value={search}
           aria-label={"Search "+titleText} placeholder="Search options"
           onChange={e=>setSearch(e.target.value)}
           onKeyDown={e=>{
             if(e.key==="ArrowDown"||e.key==="ArrowUp"){
               e.preventDefault();
               const nodes=popup.current?.querySelectorAll<HTMLButtonElement>(".paper-size-option:not(:disabled)");
               (e.key==="ArrowDown"?nodes?.[0]:nodes?.[nodes.length-1])?.focus({preventScroll:true});
             }else if(e.key==="Enter"){
               const first=visible.find(opt=>!opt.disabled);
               if(first){e.preventDefault();choose(first);}
             }
           }}/>
       </div>}
       <div role="listbox" className="paper-picker-results" aria-label={titleText}>
         {groups.map(group=><div key={group.name} role="group" aria-label={group.name||titleText}
           className="paper-picker-group">
           {group.name&&<div className="paper-picker-group-title">{group.name}</div>}
           {group.entries.map(opt=><button key={opt.value} type="button" role="option"
             aria-selected={opt.value===String(value)} disabled={opt.disabled}
             className={"paper-size-option"+(opt.value===String(value)?" selected":"")}
             onKeyDown={move} onClick={()=>choose(opt)}>
             <strong>{opt.label}</strong>{opt.description&&<small>{opt.description}</small>}
             {opt.value===String(value)&&<span aria-hidden="true">✓</span>}
           </button>)}
         </div>)}
         {!visible.length&&<p className="paper-picker-empty">No matching options.</p>}
       </div>
     </div>,trigger.current?.closest("dialog")??document.body)}
 </div>;
}
