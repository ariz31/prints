import {useRef} from "react";
import type {PointerEvent,KeyboardEvent} from "react";
import type {ShapePoint} from "../../../domain/models/crop.ts";
import {validCustomPolygon} from "../logic/studioGeometry.ts";

interface Props {
  points: readonly ShapePoint[];
  selected: number;
  onSelect: (index:number)=>void;
  onChange: (points:ShapePoint[])=>void;
  disabled?:boolean;
}
interface Drag {id:number;index:number;bounds:DOMRect}
function clipped(v:number){return Math.min(1,Math.max(0,v));}
/** Edits a single contour in output-space coordinates; the raster, packing and
 * cut-guide paths consume exactly these same normalized vertices. */
export default function PolygonPointOverlay({
  points,selected,onSelect,onChange,disabled,
}:Props){
  const drag=useRef<Drag|null>(null);
  const update=(index:number,x:number,y:number)=>{
    const next=points.map((p,i)=>i===index?{x:clipped(x),y:clipped(y)}:{...p});
    // Keep last valid geometry, including concave polygons, when crossing edges.
    if(validCustomPolygon(next))onChange(next);
  };
  const down=(index:number,e:PointerEvent<SVGCircleElement>)=>{
    e.stopPropagation();
    if(disabled||(e.pointerType==="mouse"&&e.button!==0))return;
    const root=e.currentTarget.ownerSVGElement;
    const bounds=root?.getBoundingClientRect();
    if(!bounds||bounds.width<1||bounds.height<1)return;
    try{e.currentTarget.setPointerCapture(e.pointerId);}catch{return;}
    drag.current={id:e.pointerId,index,bounds};
    onSelect(index);e.preventDefault();
  };
  const move=(e:PointerEvent<SVGCircleElement>)=>{
    e.stopPropagation();
    if(!drag.current||drag.current.id!==e.pointerId||disabled)return;
    e.preventDefault();
    const {index,bounds}=drag.current;
    update(index,(e.clientX-bounds.left)/bounds.width,
      (e.clientY-bounds.top)/bounds.height);
  };
  const end=(e:PointerEvent<SVGCircleElement>)=>{
    e.stopPropagation();
    if(drag.current?.id===e.pointerId)drag.current=null;
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const key=(index:number,e:KeyboardEvent<SVGCircleElement>)=>{
    e.stopPropagation();
    if(disabled)return;
    const directions:Record<string,[number,number]>={
      ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]
    };
    const delta=directions[e.key];
    if(!delta)return;
    e.preventDefault();onSelect(index);
    const step=e.shiftKey?.025:.0025;
    update(index,points[index].x+delta[0]*step,points[index].y+delta[1]*step);
  };
  return <svg aria-label="Custom contour vertex handles" viewBox="0 0 1000 1000"
    preserveAspectRatio="none"
    style={{position:"absolute",inset:0,width:"100%",height:"100%",
      zIndex:7,pointerEvents:"none",overflow:"visible"}}>
    {points.map((point,index)=>
      <circle key={index} cx={point.x*1000} cy={point.y*1000}
        r={index===selected?12:10}
        fill={index===selected?"#f1a622":"#ffffff"}
        stroke="#185cae" strokeWidth="4"
        role="button" tabIndex={disabled?-1:0}
        aria-label={"Contour vertex "+(index+1)+". Use arrow keys to move."}
        style={{pointerEvents:"auto",cursor:"move",touchAction:"none"}}
        onPointerDown={e=>down(index,e)} onPointerMove={move}
        onPointerUp={end} onPointerCancel={end}
        onLostPointerCapture={()=>{drag.current=null;}}
        onKeyDown={e=>key(index,e)}/>)}
  </svg>;
}
