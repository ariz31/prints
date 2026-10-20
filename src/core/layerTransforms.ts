import type { DesignLayer } from "./layers.ts";
type Rect = Pick<DesignLayer,"x"|"y"|"width"|"height">;
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
export function transformLayer<T extends Rect>(
  layer:T, kind:"move"|"resize", dx:number,dy:number, minSize=.02,
):T {
  if(![layer.x,layer.y,layer.width,layer.height,dx,dy].every(Number.isFinite))
    throw new Error("Invalid layer transform");
  if(kind==="move") return {...layer,
    x:clamp(layer.x+dx,0,1-layer.width),
    y:clamp(layer.y+dy,0,1-layer.height)};
  const width=clamp(layer.width+dx,Math.min(minSize,1-layer.x),1-layer.x);
  const height=clamp(layer.height+dy,Math.min(minSize,1-layer.y),1-layer.y);
  return {...layer,width,height};
}

/**
 * Clamp normalized layer geometry after numeric form edits.
 * Layer offsets can be 0; sizes must remain positive even at a sheet edge.
 */
export function setLayerPercent<T extends Rect>(
 layer:T,key:keyof Rect,percent:number,minSize=.01,
):T {
 if(!Number.isFinite(percent)||percent<0||percent>100||
   !Number.isFinite(minSize)||minSize<=0||minSize>1) return layer;
 if((key==="width"||key==="height")&&percent===0)return layer;
 const value=percent/100;
 const x=clamp(layer.x,0,1-minSize);
 const y=clamp(layer.y,0,1-minSize);
 const width=clamp(layer.width,minSize,1-x);
 const height=clamp(layer.height,minSize,1-y);
 switch(key){
  case "x":return {...layer,x:clamp(value,0,1-width),y,width,height};
  case "y":return {...layer,x,y:clamp(value,0,1-height),width,height};
  case "width":return {...layer,x,y,width:clamp(value,minSize,1-x),height};
  case "height":return {...layer,x,y,width,height:clamp(value,minSize,1-y)};
 }
}
