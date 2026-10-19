import { useEffect,useRef,useState } from "react";
import type { PointerEvent, KeyboardEvent } from "react";
import type { DesignLayer } from "../core/layers.ts";
import { transformLayer } from "../core/layerTransforms.ts";
interface Props{
 imageUrl?:string;ratio:number;widthMm:number;layers:DesignLayer[];
 onChange:(layers:DesignLayer[])=>void;
}
type Drag={id:string;kind:"move"|"resize";startX:number;startY:number;original:DesignLayer};
export default function LayerCanvas({imageUrl,ratio,widthMm,layers,onChange}:Props){
 const stage=useRef<HTMLDivElement>(null);
 const gesture=useRef<Drag|null>(null);
 const [draft,setDraft]=useState<DesignLayer|null>(null);
 const [selected,setSelected]=useState<string|null>(null);
 useEffect(()=>{setDraft(null);},[layers]);
 const position=(event:PointerEvent<HTMLElement>)=>{
   const bounds=stage.current?.getBoundingClientRect();
   if(!bounds||!bounds.width||!bounds.height)return null;
   return {x:(event.clientX-bounds.left)/bounds.width,y:(event.clientY-bounds.top)/bounds.height};
 };
 function down(event:PointerEvent<HTMLElement>,layer:DesignLayer,kind:"move"|"resize"){
   event.preventDefault();event.stopPropagation();
   const p=position(event);if(!p)return;
   setSelected(layer.id);
   gesture.current={id:layer.id,kind,startX:p.x,startY:p.y,original:layer};
   event.currentTarget.setPointerCapture(event.pointerId);
 }
 function move(event:PointerEvent<HTMLDivElement>){
   const session=gesture.current;
   if(!session)return;
   const p=position(event);if(!p)return;
   setDraft(transformLayer(session.original,session.kind,
     p.x-session.startX,p.y-session.startY));
 }
 function done(event:PointerEvent<HTMLDivElement>){
   const session=gesture.current;if(!session)return;
   const p=position(event);
   const updated=p?transformLayer(session.original,session.kind,
     p.x-session.startX,p.y-session.startY):session.original;
   gesture.current=null;setDraft(null);
   if(updated.x!==session.original.x||updated.y!==session.original.y||
     updated.width!==session.original.width||updated.height!==session.original.height)
     onChange(layers.map(l=>l.id===session.id?updated:l));
 }
 function key(event:KeyboardEvent<HTMLDivElement>,layer:DesignLayer){
   const moves:Record<string,[number,number]>={
     ArrowLeft:[-.01,0],ArrowRight:[.01,0],ArrowUp:[0,-.01],ArrowDown:[0,.01]
   };
   const delta=moves[event.key];if(!delta)return;
   event.preventDefault();event.stopPropagation();
   const [dx,dy]=delta;
   onChange(layers.map(l=>l.id===layer.id?transformLayer(l,"move",dx,dy):l));
 }
 return <div className="layer-canvas" ref={stage}
   role="group" aria-label="Direct manipulation of printable layers"
   style={{aspectRatio:String(ratio)}}>
   {imageUrl?<img className="layer-canvas-photo" src={imageUrl} alt="Exact print crop"/>:
     <div className="photo-loading" aria-label="Preparing image preview"/>}
   {layers.filter(l=>l.visible).map(layer=>{
     const current=draft?.id===layer.id?draft:layer;
     return <div key={layer.id} className={"layer-canvas-object "+(selected===layer.id?"is-selected":"")}
       style={{left:current.x*100+"%",top:current.y*100+"%",
         width:current.width*100+"%",height:current.height*100+"%",
         color:current.color,backgroundColor:current.kind==="text"?"transparent":current.color,
         borderRadius:current.kind==="ellipse"?"50%":undefined}}
       onPointerDown={e=>down(e,layer,"move")}
       onPointerMove={move} onPointerUp={done} onPointerCancel={done}
       onKeyDown={e=>key(e,layer)}
       tabIndex={0} role="button" aria-label={"Move "+layer.name+" (arrow keys)"}>
       {current.kind==="text"?<span className="layer-canvas-label"
         style={{fontSize:(current.fontSizePt / 72 * 25.4 / widthMm * 100)+"cqw"}}>
           {current.text}</span>:null}
       <span className="layer-resize-handle" aria-label={"Resize "+layer.name}
         onPointerDown={e=>down(e,layer,"resize")}/>
     </div>;
   })}
 </div>;
}
