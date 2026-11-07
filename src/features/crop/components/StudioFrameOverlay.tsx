import {useRef} from "react";
import type {CSSProperties,PointerEvent} from "react";
import type {CropStudioDocument} from "../logic/studioDocument.ts";
import type {CropRegion} from "../../../domain/models/crop.ts";
import {moveCropRegion,resizeCropRegion,type ResizeHandle} from "../logic/studioGeometry.ts";

interface Props{
 frame:CropStudioDocument["frame"];
 /** Physical output aspect ratio for rotated handle placement. */
 ratio:number;
 onChange:(bounds:CropRegion)=>void;
 disabled?:boolean;
}
const HANDLES:readonly ResizeHandle[]=["nw","n","ne","e","se","s","sw","w"];
const positions:Record<ResizeHandle,[number,number]>={
 nw:[0,0],n:[50,0],ne:[100,0],e:[100,50],se:[100,100],
 s:[50,100],sw:[0,100],w:[0,50],
};
type Gesture={id:number;handle:ResizeHandle|"move";x:number;y:number;
 rect:DOMRect;bounds:CropRegion};
export default function StudioFrameOverlay({frame,ratio,onChange,disabled}:Props){
 const drag=useRef<Gesture|null>(null);
 const down=(handle:ResizeHandle|"move",e:PointerEvent<HTMLButtonElement>)=>{
   e.stopPropagation();
   if(disabled||(e.pointerType==="mouse"&&e.button!==0))return;
   const parent=e.currentTarget.closest(".crop-view");
   const rect=parent?.getBoundingClientRect();
   if(!rect||rect.width<1||rect.height<1)return;
   try{e.currentTarget.setPointerCapture(e.pointerId)}catch{return}
   drag.current={id:e.pointerId,handle,x:e.clientX,y:e.clientY,
     rect,bounds:frame.bounds};
   e.preventDefault();
 };
 const move=(e:PointerEvent<HTMLButtonElement>)=>{
   e.stopPropagation();
   const g=drag.current;
   if(!g||g.id!==e.pointerId||disabled)return;
   e.preventDefault();
   const dx=(e.clientX-g.x)/g.rect.width,dy=(e.clientY-g.y)/g.rect.height;
   const angle=frame.rotationDeg*Math.PI/180;
   const cs=Math.cos(angle),sn=Math.sin(angle);
   const localDx=dx*cs+dy*sn/ratio;
   const localDy=-dx*sn*ratio+dy*cs;
   const next=g.handle==="move"
     ?moveCropRegion(g.bounds,dx,dy)
     :resizeCropRegion(g.bounds,g.handle,localDx,localDy,{minExtent:.01});
   onChange(next);
 };
 const end=(e:PointerEvent<HTMLButtonElement>)=>{
   e.stopPropagation();
   if(drag.current?.id===e.pointerId)drag.current=null;
   if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 };
 const common=(_label:string):CSSProperties=>({
   position:"absolute",width:"var(--crop-handle-size,28px)",
   height:"var(--crop-handle-size,28px)",minWidth:"var(--crop-handle-size,28px)",
   minHeight:"var(--crop-handle-size,28px)",pointerEvents:"auto",
   touchAction:"none",border:"2px solid #14a394",borderRadius:7,
   background:"#f5fffc",color:"#064a41",cursor:"move",
   opacity:disabled ? 0.4 : 1,padding:0,
 });
 const b=frame.bounds;
 return <div role="group" aria-label="Move and resize the independent frame"
   style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:8}}>
   <div style={{position:"absolute",left:b.x*100+"%",top:b.y*100+"%",
     width:b.width*100+"%",height:b.height*100+"%",pointerEvents:"none",
     transform:"rotate("+frame.rotationDeg+"deg)",
     border:"2px dashed #15c2aa",boxSizing:"border-box",borderRadius:4}}/>
   <button type="button" disabled={disabled}
     aria-label="Move independent frame"
     title="Drag to move frame" style={{...common("Move frame"),
       left:(b.x+b.width/2)*100+"%",top:(b.y+b.height/2)*100+"%",
       transform:"translate(-50%,-50%)",borderRadius:"50%"}}
     onPointerDown={e=>down("move",e)} onPointerMove={move}
     onPointerUp={end} onPointerCancel={end}
     onLostPointerCapture={()=>{drag.current=null}}/>
   {HANDLES.map(h=>{
     const [hx,hy]=positions[h];
     const dx=(hx/100-.5)*b.width,dy=(hy/100-.5)*b.height;
     const theta=frame.rotationDeg*Math.PI/180;
     const cs=Math.cos(theta),sn=Math.sin(theta);
     const px=b.x+b.width/2+dx*cs-dy*sn/ratio;
     const py=b.y+b.height/2+dx*sn*ratio+dy*cs;
     return <button key={h} type="button" disabled={disabled}
       aria-label={"Resize independent frame from "+h}
       style={{...common(h),left:px*100+"%",
         top:py*100+"%",
         transform:"translate("+(px<=.02?"0":px>=.98?"-100%":"-50%")+","+
           (py<=.02?"0":py>=.98?"-100%":"-50%")+")"}}
       onPointerDown={e=>down(h,e)} onPointerMove={move}
       onPointerUp={end} onPointerCancel={end}
       onLostPointerCapture={()=>{drag.current=null}}/>;
   })}
 </div>;
}
