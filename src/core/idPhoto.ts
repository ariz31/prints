import {fitCropToAspect} from "./crop.ts";
import type {CropRegion} from "./crop.ts";

/** Face bounding boxes are local device results, never persisted or uploaded. */
export interface FaceBounds {x:number;y:number;width:number;height:number}
export interface IdSize {id:string;label:string;widthMm:number;heightMm:number}
export const ID_SIZES:readonly IdSize[]=[
 {id:"id-1x1",label:"1 × 1 in",widthMm:25.4,heightMm:25.4},
 {id:"id-2x2",label:"2 × 2 in",widthMm:50.8,heightMm:50.8},
 {id:"id-passport",label:"35 × 45 mm",widthMm:35,heightMm:45},
];
/**
 * Frame the face using a conservative portrait composition:
 * approximately 13% headroom above the detected face and its face box
 * occupying 45% of frame height. This is a composition aid, NOT a
 * government/visa compliance determination.
 */
export function frameIdFace(face:FaceBounds,imageWidth:number,imageHeight:number,
 outWidthMm:number,outHeightMm:number,headroom=.13):CropRegion {
 if(![face.x,face.y,face.width,face.height,imageWidth,imageHeight,outWidthMm,outHeightMm,headroom]
   .every(Number.isFinite)||face.width<=0||face.height<=0||
   imageWidth<=0||imageHeight<=0||outWidthMm<=0||outHeightMm<=0||
   headroom<0||headroom>.35)
   throw new Error("Invalid face or ID photo dimensions.");
 if(face.x<0||face.y<0||face.x+face.width>imageWidth+1||
   face.y+face.height>imageHeight+1)
   throw new Error("Detected face is outside the photo.");
 const desiredHeight=face.height/.45;
 const desiredWidth=desiredHeight*outWidthMm/outHeightMm;
 const scale=Math.min(1,imageWidth/desiredWidth,imageHeight/desiredHeight);
 const w=desiredWidth*scale,h=desiredHeight*scale;
 const centerX=face.x+face.width/2;
 const left=Math.max(0,Math.min(imageWidth-w,centerX-w/2));
 const top=Math.max(0,Math.min(imageHeight-h,face.y-headroom*h));
 return fitCropToAspect({x:left/imageWidth,y:top/imageHeight,
   width:w/imageWidth,height:h/imageHeight},imageWidth,imageHeight,outWidthMm,outHeightMm);
}

/** Strictly bounded user-defined ID format (millimeters); never infer legal compliance. */
export function customIdSize(widthInput:string,heightInput:string):IdSize|null {
 const measure=(input:string)=>{
  const value=input.trim();
  if(!value||!/^(?:\d+(?:\.\d{0,3})?|\.\d{1,3})$/.test(value))return null;
  const mm=Number(value);
  return Number.isFinite(mm)&&mm>=10&&mm<=200?mm:null;
 };
 const widthMm=measure(widthInput),heightMm=measure(heightInput);
 return widthMm===null||heightMm===null?null:{
  id:"id-custom",label:"Custom "+widthMm+" × "+heightMm+" mm",widthMm,heightMm,
 };
}
