import {useRef} from "react";
import type {CSSProperties,PointerEvent,KeyboardEvent} from "react";
import type {ShapePoint} from "../../../domain/models/crop.ts";
import {validPerspectiveQuad} from "../logic/studioGeometry.ts";
interface Props{
 quad:[ShapePoint,ShapePoint,ShapePoint,ShapePoint];
 onChange:(quad:[ShapePoint,ShapePoint,ShapePoint,ShapePoint])=>void;
 disabled?:boolean;
}
const LABELS=["Top-left","Top-right","Bottom-right","Bottom-left"] as const;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
interface Drag{id:number;corner:number;rect:DOMRect}
export default function PerspectiveHandlesOverlay({quad,onChange,disabled}:Props){
 const drag=useRef<Drag|null>(null);
 const update=(index:number,x:number,y:number)=>{
   const next=quad.map((p,i)=>i===index?{x:clamp(x),y:clamp(y)}:{...p}) as [ShapePoint,ShapePoint,ShapePoint,ShapePoint];
   if(validPerspectiveQuad(next))onChange(next);
 };
 const down=(index:number,e:PointerEvent<HTMLButtonElement>)=>{
   e.stopPropagation();if(disabled||(e.pointerType==="mouse"&&e.button!==0))return;
   const rect=e.currentTarget.closest(".crop-view")?.getBoundingClientRect();
   if(!rect||rect.width<1||rect.height<1||drag.current)return;
   try{e.currentTarget.setPointerCapture(e.pointerId)}catch{return}
   drag.current={id:e.pointerId,corner:index,rect};
   e.preventDefault();
 };
 const move=(e:PointerEvent<HTMLButtonElement>)=>{
   e.stopPropagation();
   const d=drag.current;if(!d||d.id!==e.pointerId||disabled)return;
   e.preventDefault();
   update(d.corner,(e.clientX-d.rect.left)/d.rect.width,
     (e.clientY-d.rect.top)/d.rect.height);
 };
 const end=(e:PointerEvent<HTMLButtonElement>)=>{
   e.stopPropagation();if(drag.current?.id===e.pointerId)drag.current=null;
   if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 };
 const key=(i:number,e:KeyboardEvent<HTMLButtonElement>)=>{
   e.stopPropagation();if(disabled)return;
   const d:Record<string,[number,number]>={
     ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]
   };
   if(!d[e.key])return;
   e.preventDefault();
   const step=e.shiftKey?.02:.002;
   update(i,quad[i].x+d[e.key][0]*step,quad[i].y+d[e.key][1]*step);
 };
 return <div role="group" aria-label="Perspective correction corners"
   style={{position:"absolute",inset:0,zIndex:9,pointerEvents:"none"}}>
   <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
     style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
     <polygon points={quad.map(p=>p.x*100+","+p.y*100).join(" ")}
       fill="none" stroke="#e09319" strokeWidth=".55" strokeDasharray="1.3 1"/>
   </svg>
   {quad.map((p,i)=>{
     const style:CSSProperties={
       position:"absolute",left:p.x*100+"%",top:p.y*100+"%",
       transform:"translate("+(p.x===0?"0":p.x===1?"-100%":"-50%")+","+
         (p.y===0?"0":p.y===1?"-100%":"-50%")+")",
       width:"var(--crop-handle-size,28px)",height:"var(--crop-handle-size,28px)",
       minWidth:"var(--crop-handle-size,28px)",minHeight:"var(--crop-handle-size,28px)",
       border:"2px solid #db8811",borderRadius:"50%",background:"#fff3dd",
       cursor:"move",touchAction:"none",pointerEvents:"auto",padding:0,
       opacity:disabled?0.4:1,
     };
     return <button type="button" key={i} style={style} disabled={disabled}
       aria-label={LABELS[i]+" perspective corner"}
       onPointerDown={e=>down(i,e)} onPointerMove={move}
       onPointerUp={end} onPointerCancel={end}
       onLostPointerCapture={()=>{drag.current=null}}
       onKeyDown={e=>key(i,e)}/>;
   })}
 </div>;
}
