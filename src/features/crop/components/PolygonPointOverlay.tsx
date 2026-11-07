import {useRef} from "react";
import type {PointerEvent,KeyboardEvent,CSSProperties} from "react";
import type {ShapePoint} from "../../../domain/models/crop.ts";
import {validCustomPolygon} from "../logic/studioGeometry.ts";

interface Props{
 points:readonly ShapePoint[];
 selected:number;
 onSelect:(index:number)=>void;
 onChange:(points:ShapePoint[])=>void;
 disabled?:boolean;
}
interface Drag{id:number;index:number;bounds:DOMRect}
const clamp=(value:number)=>Math.min(1,Math.max(0,value));
/** Pointer and keyboard editing use fixed-size touch targets while geometry
 * remains normalized to the complete physical print frame. */
export default function PolygonPointOverlay({points,selected,onSelect,onChange,disabled}:Props){
 const drag=useRef<Drag|null>(null);
 const update=(index:number,x:number,y:number)=>{
   const next=points.map((p,i)=>i===index?{x:clamp(x),y:clamp(y)}:{...p});
   if(validCustomPolygon(next))onChange(next);
 };
 const down=(index:number,e:PointerEvent<HTMLButtonElement>)=>{
   e.stopPropagation();
   if(disabled||(e.pointerType==="mouse"&&e.button!==0))return;
   const bounds=e.currentTarget.parentElement?.getBoundingClientRect();
   if(!bounds||bounds.width<1||bounds.height<1||drag.current)return;
   try{e.currentTarget.setPointerCapture(e.pointerId);}catch{return;}
   drag.current={id:e.pointerId,index,bounds};onSelect(index);e.preventDefault();
 };
 const move=(e:PointerEvent<HTMLButtonElement>)=>{
   e.stopPropagation();
   const active=drag.current;
   if(!active||active.id!==e.pointerId||disabled)return;
   e.preventDefault();
   update(active.index,(e.clientX-active.bounds.left)/active.bounds.width,
     (e.clientY-active.bounds.top)/active.bounds.height);
 };
 const stop=(e:PointerEvent<HTMLButtonElement>)=>{
   e.stopPropagation();
   if(drag.current?.id===e.pointerId)drag.current=null;
   if(e.currentTarget.hasPointerCapture(e.pointerId))
     e.currentTarget.releasePointerCapture(e.pointerId);
 };
 const key=(index:number,e:KeyboardEvent<HTMLButtonElement>)=>{
   e.stopPropagation();
   if(disabled)return;
   const directions:Record<string,[number,number]>={
     ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1],
   };
   const delta=directions[e.key];if(!delta)return;
   e.preventDefault();onSelect(index);
   const step=e.shiftKey?.025:.0025;
   update(index,points[index].x+delta[0]*step,points[index].y+delta[1]*step);
 };
 return <div role="group" aria-label="Editable contour vertices"
   style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:7}}>
   {points.map((point,index)=>{
     const style:CSSProperties={
       position:"absolute",left:point.x*100+"%",top:point.y*100+"%",
       transform:"translate("+(point.x===0?"0":point.x===1?"-100%":"-50%")+","+
         (point.y===0?"0":point.y===1?"-100%":"-50%")+")",
       width:"var(--crop-handle-size, 28px)",height:"var(--crop-handle-size, 28px)",
       minWidth:"var(--crop-handle-size, 28px)",minHeight:"var(--crop-handle-size, 28px)",
       borderRadius:"50%",border:"2px solid #185cae",
       background:index===selected?"#f1a622":"#fff",
       boxShadow:"0 1px 4px #0007",touchAction:"none",
       pointerEvents:"auto",cursor:"move",padding:0,
       opacity:disabled ? 0.4 : 1,
     };
     return <button type="button" key={index} style={style} disabled={disabled}
       aria-label={"Contour vertex "+(index+1)+". Arrow keys move the vertex."}
       aria-pressed={index===selected}
       onPointerDown={e=>down(index,e)} onPointerMove={move}
       onPointerUp={stop} onPointerCancel={stop}
       onLostPointerCapture={()=>{drag.current=null;}}
       onKeyDown={e=>key(index,e)}/>;
   })}
 </div>;
}
