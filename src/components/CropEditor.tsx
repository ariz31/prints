import { useEffect, useRef, useState } from "react";
import type { PointerEvent, KeyboardEvent } from "react";
import type { PhotoAsset } from "../core/exportPdf.ts";
import { fitCropToAspect, panCrop, zoomCrop } from "../core/crop.ts";
import type { CropRegion } from "../core/crop.ts";
import { photoFilterCss } from "../core/photoAdjustments.ts";

interface Props{
  item:PhotoAsset;
  onUpdate:(value:CropRegion)=>void;
  onClose:()=>void;
}
/**
 * The crop window is stationary. Moving/pinching the picture adjusts
 * the normalized source crop, which is the only rectangle PDF uses.
 */
export default function CropEditor({item,onUpdate,onClose}:Props){
  const iw=item.processedWidth??item.pixelWidth,ih=item.processedHeight??item.pixelHeight;
  const fit=()=>fitCropToAspect({x:0,y:0,width:1,height:1},iw,ih,item.widthMm,item.heightMm);
  const [crop,setCrop]=useState<CropRegion>(()=>fitCropToAspect(item.crop,iw,ih,item.widthMm,item.heightMm));
  const cropRef=useRef(crop);
  const pointers=useRef(new Map<number,{x:number;y:number}>());
  const stageRef=useRef<HTMLDivElement>(null);
  const [showGrid,setGrid]=useState(true);
  const frameRatio=item.widthMm/item.heightMm;
  const base=fit();
  const zoom=Math.round(base.width/crop.width*100)/100;
  const commit=(c:CropRegion)=>{cropRef.current=c;setCrop(c);};
  const point=(e:PointerEvent<HTMLDivElement>)=>{
    const rect=e.currentTarget.getBoundingClientRect();
    return {x:(e.clientX-rect.left)/rect.width,y:(e.clientY-rect.top)/rect.height};
  };
  const move=(e:PointerEvent<HTMLDivElement>)=>{
    const previous=pointers.current.get(e.pointerId);
    if(!previous)return;
    const now=point(e);
    const before=[...pointers.current.values()];
    pointers.current.set(e.pointerId,now);
    const after=[...pointers.current.values()];
    if(before.length>=2 && after.length>=2){
      const [a,b]=before,[c,d]=after;
      const dist0=Math.hypot(b.x-a.x,b.y-a.y);
      const dist1=Math.hypot(d.x-c.x,d.y-c.y);
      if(dist0>0 && dist1>0){
        const mid0={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        const mid1={x:(c.x+d.x)/2,y:(c.y+d.y)/2};
        let next=zoomCrop(cropRef.current,dist1/dist0,mid0.x,mid0.y);
        next=panCrop(next,mid1.x-mid0.x,mid1.y-mid0.y);
        commit(next);
      }
    }else {
      commit(panCrop(cropRef.current,now.x-previous.x,now.y-previous.y));
    }
  };
  const down=(e:PointerEvent<HTMLDivElement>)=>{
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId,point(e));
  };
  const up=(e:PointerEvent<HTMLDivElement>)=>{pointers.current.delete(e.pointerId);};
  // A native non-passive wheel listener is needed on touchpad/browser wheels.
  // React delegates wheel events passively in modern browsers.
  useEffect(()=>{
    const el=stageRef.current;
    if(!el)return;
    const handle=(e:WheelEvent)=>{
      e.preventDefault();
      const rect=el.getBoundingClientRect();
      if(!rect.width||!rect.height)return;
      const x=(e.clientX-rect.left)/rect.width,y=(e.clientY-rect.top)/rect.height;
      const next=zoomCrop(cropRef.current,Math.exp(-e.deltaY/460),x,y);
      cropRef.current=next;setCrop(next);
    };
    el.addEventListener("wheel",handle,{passive:false});
    return()=>el.removeEventListener("wheel",handle);
  },[]);
  const key=(e:KeyboardEvent<HTMLDivElement>)=>{
    const moves:Record<string,[number,number]>={
      ArrowUp:[0,-.025],ArrowDown:[0,.025],ArrowLeft:[-.025,0],ArrowRight:[.025,0]
    };
    if(moves[e.key]){
      e.preventDefault();
      const [dx,dy]=moves[e.key];
      commit(panCrop(cropRef.current,dx,dy));
    }else if(e.key==="+" || e.key==="="){e.preventDefault();commit(zoomCrop(cropRef.current,1.12));}
    else if(e.key==="-"){e.preventDefault();commit(zoomCrop(cropRef.current,1/1.12));}
  };
  const setZoom=(newValue:number)=>{
    commit(zoomCrop(cropRef.current,newValue/(base.width/cropRef.current.width)));
  };
  return <section className="crop-editor" aria-label="Photo framing editor">
    <div className="crop-toolbar">
      <div><h2>Crop & frame</h2><p>Move the photo inside the fixed print window.</p></div>
      <button className="icon-button crop-close" onClick={onClose} aria-label="Close crop editor">×</button>
    </div>
    <div ref={stageRef} className="crop-view" style={{aspectRatio:String(frameRatio)}} role="group"
      tabIndex={0} aria-label="Drag to move photo; pinch, scroll or use the slider to zoom"
      onPointerDown={down} onPointerMove={move} onPointerUp={up}
      onPointerCancel={up} onLostPointerCapture={up} onKeyDown={key}>
      <img src={item.processedUrl??item.url} alt={item.name} draggable={false}
        style={{filter:photoFilterCss(item.adjustments),width:(100/crop.width)+"%",height:(100/crop.height)+"%",
          left:(-100*crop.x/crop.width)+"%",top:(-100*crop.y/crop.height)+"%"}}/>
      {showGrid&&<div className="crop-grid" aria-hidden="true"/>}
      <span className="crop-frame-corner top-left"/><span className="crop-frame-corner top-right"/>
      <span className="crop-frame-corner bottom-left"/><span className="crop-frame-corner bottom-right"/>
    </div>
    <div className="crop-zoom">
      <button className="icon-button" aria-label="Zoom out" onClick={()=>setZoom(Math.max(1,zoom/1.25))}>−</button>
      <label>Zoom <input type="range" min="1" max="8" step=".01" value={Math.min(8,zoom)}
        onChange={e=>setZoom(Number(e.target.value))}/></label>
      <button className="icon-button" aria-label="Zoom in" onClick={()=>setZoom(Math.min(8,zoom*1.25))}>+</button>
      <span className="crop-zoom-value">{Math.round(zoom*100)}%</span>
    </div>
    <div className="crop-actions">
      <label className="check-row"><input type="checkbox" checked={showGrid}
        onChange={e=>setGrid(e.target.checked)}/>Grid</label>
      <button className="secondary-button" onClick={()=>commit(fit())}>Reset</button>
      <span className="crop-output">{item.widthMm} × {item.heightMm} mm</span>
      <button className="primary-button" onClick={()=>{onUpdate(cropRef.current);onClose();}}>Apply crop</button>
    </div>
  </section>;
}
