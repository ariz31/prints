import {panCrop,zoomCrop} from "./crop.ts";
import type {CropRegion} from "./crop.ts";
export interface CropPointer{x:number;y:number}
/** Distances are measured in CSS pixels, even for a non-square crop window. */
export function gestureCrop(crop:CropRegion,before:readonly CropPointer[],after:readonly CropPointer[],
 bounds:{left:number;top:number;width:number;height:number}):CropRegion{
 if(![bounds.left,bounds.top,bounds.width,bounds.height,...before.flatMap(p=>[p.x,p.y]),...after.flatMap(p=>[p.x,p.y])].every(Number.isFinite)||
  bounds.width<=0||bounds.height<=0||!before.length||before.length!==after.length||before.length>2)return crop;
 if(before.length===1)return panCrop(crop,(after[0].x-before[0].x)/bounds.width,(after[0].y-before[0].y)/bounds.height);
 const [a,b]=before,[c,d]=after;
 const oldDistance=Math.hypot(b.x-a.x,b.y-a.y),distance=Math.hypot(d.x-c.x,d.y-c.y);
 if(oldDistance<1||distance<1)return crop;
 const x=(a.x+b.x)/2,y=(a.y+b.y)/2;
 const next=zoomCrop(crop,Math.max(.125,Math.min(8,distance/oldDistance)),(x-bounds.left)/bounds.width,(y-bounds.top)/bounds.height);
 return panCrop(next,((c.x+d.x)/2-x)/bounds.width,((c.y+d.y)/2-y)/bounds.height);
}
