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
