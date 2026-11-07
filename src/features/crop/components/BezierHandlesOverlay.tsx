import {useRef} from "react";
import type {CSSProperties,PointerEvent,KeyboardEvent} from "react";
import type {ShapePoint} from "../../../domain/models/crop.ts";
import type {BezierHandles} from "../logic/bezierContour.ts";
interface Props{
 anchors:readonly ShapePoint[];
 handles:readonly BezierHandles[];
 selected:number;
 onChange:(next:BezierHandles[])=>void;
 disabled?:boolean;
}
type Which="in"|"out";
interface Drag{id:number;vertex:number;which:Which;rect:DOMRect}
const clamp=(v:number)=>Math.min(1,Math.max(0,v));
export default function BezierHandlesOverlay({
 anchors,handles,selected,onChange,disabled,
}:Props){
 const drag=useRef<Drag|null>(null);
 if(!handles[selected]||!anchors[selected])return null;
 const update=(vertex:number,which:Which,x:number,y:number)=>{
   const next=handles.map((h,i)=>i===vertex?{
     ...h,[which]:{x:clamp(x),y:clamp(y)},
   }:{in:{...h.in},out:{...h.out}});
   onChange(next);
 };
 const down=(which:Which,e:PointerEvent<HTMLButtonElement>)=>{
   e.stopPropagation();if(disabled||(e.pointerType==="mouse"&&e.button!==0))return;
   const bounds=e.currentTarget.closest(".crop-view")?.getBoundingClientRect();
   if(!bounds||bounds.width<1||bounds.height<1||drag.current)return;
   try{e.currentTarget.setPointerCapture(e.pointerId)}catch{return;}
   drag.current={id:e.pointerId,vertex:selected,which,rect:bounds};
   e.preventDefault();
 };
 const move=(e:PointerEvent<HTMLButtonElement>)=>{
   e.stopPropagation();const d=drag.current;
   if(!d||d.id!==e.pointerId||disabled)return;
   update(d.vertex,d.which,(e.clientX-d.rect.left)/d.rect.width,
     (e.clientY-d.rect.top)/d.rect.height);
 };
 const stop=(e:PointerEvent<HTMLButtonElement>)=>{
   e.stopPropagation();if(drag.current?.id===e.pointerId)drag.current=null;
   if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 };
 const key=(which:Which,e:KeyboardEvent<HTMLButtonElement>)=>{
   e.stopPropagation();if(disabled)return;
   const dirs:Record<string,[number,number]>={
     ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1],
   };
   const d=dirs[e.key];if(!d)return;
   e.preventDefault();
   const step=e.shiftKey?.02:.002;
   update(selected,which,handles[selected][which].x+d[0]*step,
     handles[selected][which].y+d[1]*step);
 };
 const anchor=anchors[selected],curr=handles[selected];
 return <div role="group" aria-label="Bézier tangents for selected vertex"
   style={{position:"absolute",inset:0,zIndex:10,pointerEvents:"none"}}>
   <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
     style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}>
     {(["in","out"] as const).map(which=><line key={which}
       x1={anchor.x*100} y1={anchor.y*100}
       x2={curr[which].x*100} y2={curr[which].y*100}
       stroke="#ffb56c" strokeWidth=".4" strokeDasharray="1.1 .7"/>)}
   </svg>
   {(["in","out"] as const).map(which=>{
     const p=curr[which];
     const style:CSSProperties={
       position:"absolute",left:p.x*100+"%",top:p.y*100+"%",
       transform:"translate(-50%,-50%)",
       width:"var(--crop-handle-size,28px)",height:"var(--crop-handle-size,28px)",
       minWidth:"var(--crop-handle-size,28px)",minHeight:"var(--crop-handle-size,28px)",
       border:"2px solid #bf6300",borderRadius:"50%",
       background:which==="in"?"#fef4dd":"#fff2a6",
       cursor:"crosshair",touchAction:"none",pointerEvents:"auto",padding:0,
       opacity:disabled?0.4:1,
     };
     return <button type="button" key={which} style={style} disabled={disabled}
       aria-label={"Bézier "+which+" control for vertex "+(selected+1)}
       onPointerDown={e=>down(which,e)} onPointerMove={move}
       onPointerUp={stop} onPointerCancel={stop}
       onLostPointerCapture={()=>{drag.current=null;}}
       onKeyDown={e=>key(which,e)}/>;
   })}
 </div>;
}
