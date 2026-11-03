import {useEffect,useRef,useState} from "react";
import type {KeyboardEvent as ReactKeyboardEvent} from "react";
import {createPortal} from "react-dom";
import {PAPER_GROUPS,PAPER_SIZES} from "../core/layout.ts";
import type {PaperName} from "../core/layout.ts";
import type {CustomPaperSize} from "../core/paperLibrary.ts";
import {samePaperSize} from "../core/paperLibrary.ts";
import {paperPickerBounds} from "../core/paperPickerGeometry.ts";

export interface PaperSelection {
 paper:PaperName;
 customWidthMm:number;
 customHeightMm:number;
}
interface Props extends PaperSelection {
 customPapers:readonly CustomPaperSize[];
 onSelect:(value:PaperSelection)=>void;
 label?:string;
}
const fmt=(n:number)=>Number(n.toFixed(3)).toString();
const measurement=(w:number,h:number)=>fmt(w)+" × "+fmt(h)+" mm";

/** Compact, searchable paper menu independent of Android's fullscreen native select. */
export default function PaperSizePicker({paper,customWidthMm,customHeightMm,customPapers,onSelect,label="Paper size"}:Props){
 const [open,setOpen]=useState(false);
 const [search,setSearch]=useState("");
 const [position,setPosition]=useState({top:0,left:0,width:280,maxHeight:300});
 const trigger=useRef<HTMLButtonElement>(null);
 const popup=useRef<HTMLDivElement>(null);
 const searchInput=useRef<HTMLInputElement>(null);
 const dims=paper==="Custom"?{widthMm:customWidthMm,heightMm:customHeightMm}:PAPER_SIZES[paper];
 const match=paper==="Custom"?customPapers.find(p=>samePaperSize(p,dims)):undefined;
 const currentName=paper==="Custom"?(match?.name??"Custom size"):paper;
 const close=()=>{setOpen(false);setSearch("");};
 function reposition(){
   const rect=trigger.current?.getBoundingClientRect();
   if(!rect)return;
   const visual=window.visualViewport;
   setPosition(paperPickerBounds(rect,{
     width:visual?.width??window.innerWidth,
     height:visual?.height??window.innerHeight,
     offsetTop:visual?.offsetTop??0,
     offsetLeft:visual?.offsetLeft??0,
   }));
 }
 function show(){
   if(open){close();return;}
   reposition();
   setSearch("");setOpen(true);
 }
 useEffect(()=>{
   if(!open)return;
   // Autofocus on mobile launches the soft keyboard before positioning settles.
   // Touch users can opt into search; the picker remains usable without typing.
   if(!window.matchMedia?.("(pointer: coarse)").matches)
     searchInput.current?.focus({preventScroll:true});
   function outside(event:PointerEvent){
     if(!popup.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))
       close();
   }
   function keys(event:KeyboardEvent){
     if(event.key==="Escape"){event.preventDefault();close();trigger.current?.focus();}
   }
   function shifted(event:Event){
     // A mobile soft keyboard resizes the viewport. Reposition instead of
     // dismissing the menu the moment the user starts searching.
     if(event.type==="scroll"&&popup.current?.contains(event.target as Node))return;
     reposition();
   }
   document.addEventListener("pointerdown",outside);
   document.addEventListener("keydown",keys);
   window.addEventListener("resize",shifted);
   window.addEventListener("scroll",shifted,true);
   window.visualViewport?.addEventListener("resize",shifted);
   window.visualViewport?.addEventListener("scroll",shifted);
   return()=>{
     document.removeEventListener("pointerdown",outside);
     document.removeEventListener("keydown",keys);
     window.removeEventListener("resize",shifted);
     window.removeEventListener("scroll",shifted,true);
     window.visualViewport?.removeEventListener("resize",shifted);
     window.visualViewport?.removeEventListener("scroll",shifted);
   };
 },[open]);
 const needle=search.trim().toLocaleLowerCase();
 const visible=(name:string,w:number,h:number)=>!needle||
   (name+" "+measurement(w,h)).toLocaleLowerCase().includes(needle);
 const chosen=(value:PaperSelection)=>{onSelect(value);close();trigger.current?.focus({preventScroll:true});};
 function navigateOptions(event:ReactKeyboardEvent<HTMLButtonElement>){
   if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
   const options=Array.from(popup.current?.querySelectorAll<HTMLButtonElement>(".paper-size-option")??[]);
   const index=options.indexOf(event.currentTarget);
   if(index<0||!options.length)return;
   event.preventDefault();
   const target=event.key==="Home"?0:event.key==="End"?options.length-1:
     (index+(event.key==="ArrowDown"?1:-1)+options.length)%options.length;
   options[target]?.focus({preventScroll:true});
   options[target]?.scrollIntoView({block:"nearest"});
 }
 const option=(name:string,w:number,h:number,value:PaperSelection,id:string)=>{
   const selected=paper===value.paper&&(paper!=="Custom"||
     (samePaperSize({widthMm:customWidthMm,heightMm:customHeightMm},{widthMm:w,heightMm:h})&&
       (id!=="manual"||!match)));
   return <button key={id} type="button" role="option" aria-selected={selected}
     className={"paper-size-option"+(selected?" selected":"")}
     onKeyDown={navigateOptions} onClick={()=>chosen(value)}>
     <strong>{name}</strong><small>{measurement(w,h)}</small>{selected&&<span aria-hidden="true">✓</span>}
   </button>;
 };
 return <div className="paper-size-picker">
   <button type="button" ref={trigger} className="paper-size-picker-button"
     aria-label={label+": "+currentName+" "+measurement(dims.widthMm,dims.heightMm)}
     aria-haspopup="dialog" aria-expanded={open} onClick={show}>
     <span><strong>{currentName}</strong><small>{measurement(dims.widthMm,dims.heightMm)}</small></span>
     <span className="paper-picker-chevron" aria-hidden="true">⌄</span>
   </button>
   {open&&typeof document!=="undefined"&&createPortal(
     <div ref={popup} role="dialog" aria-label={label+" options"}
       className="paper-size-picker-panel" style={position}>
       <div className="paper-picker-search">
         <input ref={searchInput} type="search" value={search} placeholder="Search paper sizes"
           aria-label="Search paper sizes" onChange={e=>setSearch(e.target.value)}
           onKeyDown={event=>{
             if(event.key==="ArrowDown"||event.key==="ArrowUp"){
               event.preventDefault();
               const options=popup.current?.querySelectorAll<HTMLButtonElement>(".paper-size-option");
               (event.key==="ArrowDown"?options?.[0]:options?.[options.length-1])?.focus();
             }else if(event.key==="Enter"){
               const first=popup.current?.querySelector<HTMLButtonElement>(".paper-size-option");
               if(first){event.preventDefault();first.click();}
             }
           }}/>
       </div>
       <div className="paper-picker-results" role="listbox" aria-label="Available paper sizes">
         {PAPER_GROUPS.map(group=>{
           const matches=group.papers.filter(name=>visible(name,PAPER_SIZES[name].widthMm,PAPER_SIZES[name].heightMm));
           return matches.length?<div className="paper-picker-group" role="group" aria-label={group.label} key={group.label}>
             <div className="paper-picker-group-title">{group.label}</div>
             {matches.map(name=>option(name,PAPER_SIZES[name].widthMm,PAPER_SIZES[name].heightMm,
               {paper:name,customWidthMm,customHeightMm},"built-in-"+name))}
           </div>:null;
         })}
         {customPapers.some(p=>visible(p.name,p.widthMm,p.heightMm))&&
           <div className="paper-picker-group" role="group" aria-label="Saved custom sizes">
             <div className="paper-picker-group-title">Saved custom sizes</div>
             {customPapers.filter(p=>visible(p.name,p.widthMm,p.heightMm)).map(p=>
               option(p.name,p.widthMm,p.heightMm,
                 {paper:"Custom",customWidthMm:p.widthMm,customHeightMm:p.heightMm},"custom-"+p.id))}
           </div>}
         {visible("Custom dimensions",customWidthMm,customHeightMm)&&
           <div className="paper-picker-group" role="group" aria-label="Manual entry">
             <div className="paper-picker-group-title">Manual entry</div>
             {option("Custom dimensions…",customWidthMm,customHeightMm,
               {paper:"Custom",customWidthMm:customWidthMm||210,customHeightMm:customHeightMm||297},"manual")}
           </div>}
         {!PAPER_GROUPS.some(g=>g.papers.some(name=>visible(name,PAPER_SIZES[name].widthMm,PAPER_SIZES[name].heightMm)))&&
          !customPapers.some(p=>visible(p.name,p.widthMm,p.heightMm))&&
          !visible("Custom dimensions",customWidthMm,customHeightMm)&&
          <p className="paper-picker-empty">No matching paper sizes.</p>}
       </div>
     </div>,document.body)}
 </div>;
}
