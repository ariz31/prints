import { useEffect,useRef,useState } from "react";
import type { PointerEvent, KeyboardEvent, CSSProperties } from "react";
import type { DesignLayer } from "../core/layers.ts";
import {snapSelection,transformSelection} from "../core/layerSelection.ts";
import { nudgeLayer } from "../core/layerKeyboard.ts";
import {fontCssName,loadLocalFonts} from "../core/fontAssets.ts";
import FrameSvg from "./FrameSvg.tsx";
interface Props{
 imageUrl?:string;ratio:number;widthMm:number;layers:DesignLayer[];
 onChange:(layers:DesignLayer[])=>void;selectedIds:string[];onSelect:(ids:string[])=>void;
}
type Drag={id:string;pointerId:number;kind:"move"|"resize";
  startX:number;startY:number;original:DesignLayer[];ids:string[]};
export default function LayerCanvas({imageUrl,ratio,widthMm,layers,onChange,selectedIds,onSelect}:Props){
 const stage=useRef<HTMLDivElement>(null);
 const gesture=useRef<Drag|null>(null);
 const [draft,setDraft]=useState<DesignLayer[]|null>(null);
 const latestDraft=useRef<DesignLayer[]|null>(null);
 const [guides,setGuides]=useState<{axis:"x"|"y";value:number}[]>([]);
 useEffect(()=>{latestDraft.current=null;setDraft(null);void loadLocalFonts(layers).catch(()=>{});},[layers]);
 const position=(event:PointerEvent<HTMLElement>)=>{
   const bounds=stage.current?.getBoundingClientRect();
   if(!bounds||!bounds.width||!bounds.height)return null;
   return {x:(event.clientX-bounds.left)/bounds.width,y:(event.clientY-bounds.top)/bounds.height};
 };
 function down(event:PointerEvent<HTMLElement>,layer:DesignLayer,kind:"move"|"resize"){
   if(gesture.current||(event.pointerType==="mouse"&&event.button!==0))return;
   event.preventDefault();event.stopPropagation();
   const p=position(event);if(!p)return;
   const group=layer.groupId?layers.filter(l=>l.groupId===layer.groupId).map(l=>l.id):[layer.id];
   const additive=event.shiftKey||event.ctrlKey||event.metaKey;
   const ids=additive?[...new Set([...selectedIds,...group])]:selectedIds.includes(layer.id)?selectedIds:group;
   onSelect(ids);event.currentTarget.focus();
   gesture.current={id:layer.id,pointerId:event.pointerId,kind,
     startX:p.x,startY:p.y,original:layers,ids};
   try{event.currentTarget.setPointerCapture(event.pointerId);}catch{gesture.current=null;}
 }
 function move(event:PointerEvent<HTMLDivElement>){
   const session=gesture.current;
   if(!session||session.pointerId!==event.pointerId)return;
   const p=position(event);if(!p)return;
   let dx=p.x-session.startX,dy=p.y-session.startY;
   if(session.kind==="move"&&!event.altKey){
    const bounds=stage.current!.getBoundingClientRect();
    const snapped=snapSelection(session.original,session.ids,dx,dy,6/bounds.width,6/bounds.height);
    dx=snapped.dx;dy=snapped.dy;setGuides(snapped.guides);
   }else setGuides([]);
   const next=transformSelection(session.original,session.ids,session.kind,dx,dy);
   latestDraft.current=next;setDraft(next);
 }
 function done(event:PointerEvent<HTMLDivElement>){
   const session=gesture.current;
   if(!session||session.pointerId!==event.pointerId)return;
   const p=position(event);
   // Pointer release may arrive in the same frame as movement, before React
   // renders. Commit the synchronous preview, including its snap adjustment.
   const updated=latestDraft.current??(p?transformSelection(session.original,session.ids,session.kind,p.x-session.startX,p.y-session.startY):session.original);
   gesture.current=null;latestDraft.current=null;setDraft(null);setGuides([]);
   if(JSON.stringify(updated)!==JSON.stringify(layers))onChange(updated);
 }
 function cancel(event:PointerEvent<HTMLDivElement>){
   if(gesture.current?.pointerId!==event.pointerId)return;
   gesture.current=null;latestDraft.current=null;
   setDraft(null);setGuides([]);
 }
 function key(event:KeyboardEvent<HTMLDivElement>,layer:DesignLayer){
   if(event.key==="Escape"){gesture.current=null;latestDraft.current=null;setDraft(null);setGuides([]);event.preventDefault();return;}
   const adjusted=nudgeLayer(layer,event.key,event.shiftKey,event.altKey);
   if(!adjusted)return;
   event.preventDefault();event.stopPropagation();
   if(adjusted.x===layer.x&&adjusted.y===layer.y&&
      adjusted.width===layer.width&&adjusted.height===layer.height)return;
   onChange(transformSelection(layers,selectedIds.includes(layer.id)?selectedIds:[layer.id],event.shiftKey?"resize":"move",
    event.shiftKey?adjusted.width-layer.width:adjusted.x-layer.x,event.shiftKey?adjusted.height-layer.height:adjusted.y-layer.y));
 }
 return <div className="layer-canvas" ref={stage}
   role="group" aria-label="Direct manipulation of printable layers"
   style={{aspectRatio:String(ratio),"--design-ratio":String(ratio)} as CSSProperties}>
   {imageUrl?<img className="layer-canvas-photo" src={imageUrl} alt="Exact print crop"/>:
     <div className="photo-loading" aria-label="Preparing image preview"/>}
   {layers.filter(l=>l.visible).map(layer=>{
     const current=draft?.find(l=>l.id===layer.id)??layer;
     if(current.kind==="frame")return <div key={current.id} className="layer-canvas-frame"
       style={{opacity:current.opacity??1}} aria-hidden="true">
       <FrameSvg frameId={current.frameId} widthMm={widthMm} heightMm={widthMm/ratio}
         weight={current.weight} inset={current.inset} spacing={current.spacing} color={current.color}/>
     </div>;
     return <div key={layer.id} className={"layer-canvas-object "+(selectedIds.includes(layer.id)?"is-selected":"")}
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
           WebkitTextStroke:current.outlinePt?String(current.outlinePt*2/72*25.4/widthMm*100)+"cqw "+(current.outlineColor??"#ffffff"):undefined,
           textShadow:current.shadowPt?String(current.shadowPt/72*25.4/widthMm*100)+"cqw "+String(current.shadowPt/72*25.4/widthMm*100)+"cqw "+(current.shadowColor??"#333333"):undefined}}>
           {current.text}</span>:null}
       {selectedIds.includes(layer.id)&&<span className="layer-resize-handle" aria-label={"Resize "+layer.name}
         onPointerDown={e=>down(e,layer,"resize")}/>}
     </div>;
   })}
   {guides.map((g,i)=><span key={i} className={"alignment-guide guide-"+g.axis} aria-hidden="true"
     style={g.axis==="x"?{left:g.value*100+"%"}:{top:g.value*100+"%"}}/>)}
 </div>;
}
