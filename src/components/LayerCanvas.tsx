import { useEffect,useRef,useState } from "react";
import type { PointerEvent, KeyboardEvent, CSSProperties } from "react";
import type { DesignLayer } from "../core/layers.ts";
import { transformLayer } from "../core/layerTransforms.ts";
import { nudgeLayer } from "../core/layerKeyboard.ts";
import {fontCssName,loadLocalFonts} from "../core/fontAssets.ts";
import FrameSvg from "./FrameSvg.tsx";
interface Props{
 imageUrl?:string;ratio:number;widthMm:number;layers:DesignLayer[];
 onChange:(layers:DesignLayer[])=>void;
}
type Drag={id:string;pointerId:number;kind:"move"|"resize";
  startX:number;startY:number;original:DesignLayer};
export default function LayerCanvas({imageUrl,ratio,widthMm,layers,onChange}:Props){
 const stage=useRef<HTMLDivElement>(null);
 const gesture=useRef<Drag|null>(null);
 const [draft,setDraft]=useState<DesignLayer|null>(null);
 const [selected,setSelected]=useState<string|null>(null);
 useEffect(()=>{setDraft(null);void loadLocalFonts(layers).catch(()=>{});},[layers]);
 const position=(event:PointerEvent<HTMLElement>)=>{
   const bounds=stage.current?.getBoundingClientRect();
   if(!bounds||!bounds.width||!bounds.height)return null;
   return {x:(event.clientX-bounds.left)/bounds.width,y:(event.clientY-bounds.top)/bounds.height};
 };
 function down(event:PointerEvent<HTMLElement>,layer:DesignLayer,kind:"move"|"resize"){
   event.preventDefault();event.stopPropagation();
   const p=position(event);if(!p)return;
   setSelected(layer.id);
   gesture.current={id:layer.id,pointerId:event.pointerId,kind,
     startX:p.x,startY:p.y,original:layer};
   event.currentTarget.setPointerCapture(event.pointerId);
 }
 function move(event:PointerEvent<HTMLDivElement>){
   const session=gesture.current;
   if(!session||session.pointerId!==event.pointerId)return;
   const p=position(event);if(!p)return;
   setDraft(transformLayer(session.original,session.kind,
     p.x-session.startX,p.y-session.startY));
 }
 function done(event:PointerEvent<HTMLDivElement>){
   const session=gesture.current;
   if(!session||session.pointerId!==event.pointerId)return;
   const p=position(event);
   const updated=p?transformLayer(session.original,session.kind,
     p.x-session.startX,p.y-session.startY):session.original;
   gesture.current=null;setDraft(null);
   if(updated.x!==session.original.x||updated.y!==session.original.y||
     updated.width!==session.original.width||updated.height!==session.original.height)
     onChange(layers.map(l=>l.id===session.id?updated:l));
 }
 function cancel(event:PointerEvent<HTMLDivElement>){
   if(gesture.current?.pointerId!==event.pointerId)return;
   gesture.current=null;
   setDraft(null);
 }
 function key(event:KeyboardEvent<HTMLDivElement>,layer:DesignLayer){
   const adjusted=nudgeLayer(layer,event.key,event.shiftKey,event.altKey);
   if(!adjusted)return;
   event.preventDefault();event.stopPropagation();
   if(adjusted.x===layer.x&&adjusted.y===layer.y&&
      adjusted.width===layer.width&&adjusted.height===layer.height)return;
   onChange(layers.map(l=>l.id===layer.id?adjusted:l));
 }
 return <div className="layer-canvas" ref={stage}
   role="group" aria-label="Direct manipulation of printable layers"
   style={{aspectRatio:String(ratio),"--design-ratio":String(ratio)} as CSSProperties}>
   {imageUrl?<img className="layer-canvas-photo" src={imageUrl} alt="Exact print crop"/>:
     <div className="photo-loading" aria-label="Preparing image preview"/>}
   {layers.filter(l=>l.visible).map(layer=>{
     const current=draft?.id===layer.id?draft:layer;
     if(current.kind==="frame")return <div key={current.id} className="layer-canvas-frame"
       style={{opacity:current.opacity??1}} aria-hidden="true">
       <FrameSvg frameId={current.frameId} widthMm={widthMm} heightMm={widthMm/ratio}
         weight={current.weight} color={current.color}/>
     </div>;
     return <div key={layer.id} className={"layer-canvas-object "+(selected===layer.id?"is-selected":"")}
       style={{left:current.x*100+"%",top:current.y*100+"%",
         width:current.width*100+"%",height:current.height*100+"%",
         color:current.color,backgroundColor:current.kind==="text"?"transparent":current.color,
         opacity:current.opacity??1,
         borderRadius:current.kind==="ellipse"?"50%":undefined}}
       onPointerDown={e=>down(e,layer,"move")}
       onPointerMove={move} onPointerUp={done}
       onPointerCancel={cancel} onLostPointerCapture={cancel}
       onKeyDown={e=>key(e,layer)}
       tabIndex={0} role="button"
       aria-label={"Move "+layer.name+": arrow keys move, Shift plus arrows resize, Alt for fine adjustments"}>
       {current.kind==="text"?<span className="layer-canvas-label"
         style={{fontSize:(current.fontSizePt / 72 * 25.4 / widthMm * 100)+"cqw",
           fontFamily:fontCssName(current),whiteSpace:"pre",
           textAlign:current.align??"left",lineHeight:current.lineHeightFactor??1.2,
           WebkitTextStroke:current.outlinePt?String(current.outlinePt*.75)+"px "+(current.outlineColor??"#ffffff"):undefined,
           textShadow:current.shadowPt?String(current.shadowPt)+"px "+String(current.shadowPt)+"px "+(current.shadowColor??"#333333"):undefined}}>
           {current.text}</span>:null}
       <span className="layer-resize-handle" aria-label={"Resize "+layer.name}
         onPointerDown={e=>down(e,layer,"resize")}/>
     </div>;
   })}
 </div>;
}
