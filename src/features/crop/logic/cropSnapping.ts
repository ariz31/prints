import type {CropRegion} from "../../../domain/models/crop.ts";
import {validCropRegion} from "./studioGeometry.ts";

export interface CropSnapOptions {
  enabled:boolean;
  /** Threshold measured in CSS pixels, independent of device DPR. */
  sensitivityPx:number;
  viewportWidthPx:number;
  viewportHeightPx:number;
}
/** Snap a moved source rectangle to source boundaries or center without
 * changing its dimensions or physically locked output aspect. */
export function snapCropPosition(crop:CropRegion,options:CropSnapOptions):CropRegion{
  if(!validCropRegion(crop))throw new Error("Invalid crop snap coordinates.");
  const {enabled,sensitivityPx,viewportWidthPx,viewportHeightPx}=options;
  if(![sensitivityPx,viewportWidthPx,viewportHeightPx].every(Number.isFinite)||
    sensitivityPx<0||sensitivityPx>64||viewportWidthPx<=0||viewportHeightPx<=0)
    throw new Error("Invalid crop snapping settings.");
  if(!enabled)return crop;
  const thresholdX=sensitivityPx*crop.width/viewportWidthPx;
  const thresholdY=sensitivityPx*crop.height/viewportHeightPx;
  const nearest=(value:number,targets:readonly number[],threshold:number)=>{
    let best=value,delta=Infinity;
    for(const target of targets){
      const d=Math.abs(value-target);
      if(d<=threshold&&d<delta){best=target;delta=d;}
    }
    return best;
  };
  const x=nearest(crop.x,[0,(1-crop.width)/2,1-crop.width],thresholdX);
  const y=nearest(crop.y,[0,(1-crop.height)/2,1-crop.height],thresholdY);
  if(x===crop.x&&y===crop.y)return crop;
  return {...crop,x,y};
}
