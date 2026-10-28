import {useEffect,useRef,useState} from "react";
import type {PointerEvent} from "react";
import {INITIAL_PREVIEW_VIEW,panPreviewView,pinchPreviewView,zoomPreviewView} from "../core/photoViewport.ts";
import type {PreviewView} from "../core/photoViewport.ts";
/** View-only gestures: photo editing pixels and exported coordinates are untouched. */
export function usePreviewViewport(enabled:boolean){
 const stageRef=useRef<HTMLDivElement>(null),contentRef=useRef<HTMLCanvasElement>(null);
 const [view,setView]=useState<PreviewView>(INITIAL_PREVIEW_VIEW),latest=useRef(view);latest.current=view;
 const pointers=useRef(new Map<number,{x:number;y:number}>());
 const geometry=()=>({stage:{width:stageRef.current?.clientWidth??0,height:stageRef.current?.clientHeight??0},
  content:{width:contentRef.current?.clientWidth??0,height:contentRef.current?.clientHeight??0}});
 const commit=(next:PreviewView)=>{latest.current=next;setView(next);};
 useEffect(()=>{pointers.current.clear();},[enabled]);
 useEffect(()=>{
  const node=stageRef.current;if(!node)return;
  const observer=new ResizeObserver(()=>{const g=geometry();commit(zoomPreviewView(latest.current,latest.current.scale,g.stage,g.content));});
  observer.observe(node);return()=>observer.disconnect();
 },[]);
 const point=(e:PointerEvent<HTMLDivElement>)=>{const rect=e.currentTarget.getBoundingClientRect();return {x:e.clientX-rect.left,y:e.clientY-rect.top};};
 return {stageRef,contentRef,view,
  zoom:(scale:number)=>{const g=geometry();commit(zoomPreviewView(latest.current,scale,g.stage,g.content));},
  handlers:{
   onPointerDown:(e:PointerEvent<HTMLDivElement>)=>{
    if(!enabled||pointers.current.size>=2||(e.pointerType==="mouse"&&e.button!==0))return;
    try{e.currentTarget.setPointerCapture(e.pointerId);}catch{return;}
    pointers.current.set(e.pointerId,point(e));
   },
   onPointerMove:(e:PointerEvent<HTMLDivElement>)=>{
    const previous=pointers.current.get(e.pointerId);if(!enabled||!previous)return;
    const before=[...pointers.current.values()],now=point(e);pointers.current.set(e.pointerId,now);
    const after=[...pointers.current.values()],g=geometry();
    commit(before.length===2?pinchPreviewView(latest.current,[before[0],before[1]],[after[0],after[1]],g.stage,g.content):
     panPreviewView(latest.current,now.x-previous.x,now.y-previous.y,g.stage,g.content));
   },
   onPointerUp:(e:PointerEvent<HTMLDivElement>)=>{pointers.current.delete(e.pointerId);},
   onPointerCancel:(e:PointerEvent<HTMLDivElement>)=>{pointers.current.delete(e.pointerId);},
   onLostPointerCapture:(e:PointerEvent<HTMLDivElement>)=>{pointers.current.delete(e.pointerId);},
  }};
}
