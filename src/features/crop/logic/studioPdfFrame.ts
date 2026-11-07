import {
  rgb,pushGraphicsState,popGraphicsState,concatTransformationMatrix,
  moveTo,lineTo,closePath,clip,endPath,
} from "pdf-lib";
import type {PDFPage} from "pdf-lib";
import type {PhotoAsset} from "../../../domain/models/asset.ts";
import type {Placement} from "../../../domain/models/sheet.ts";
import {PDF_POINTS_PER_MM} from "../../../core/layout.ts";
import {drawFramePdf} from "../../frames/logic/framePdf.ts";
import {shapePolygonMm} from "./cropShapes.ts";
const rad=(deg:number)=>deg*Math.PI/180;
const p=(mm:number)=>mm*PDF_POINTS_PER_MM;
const color=(hex:string)=>rgb(parseInt(hex.slice(1,3),16)/255,
 parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);

/** Keep PDF photo layers alpha-correct, but render v2 border artwork as actual
 * vector drawing operators instead of baking it into a 300-DPI PNG. */
export function pdfPhotoWithoutVectorFrame(asset:PhotoAsset):PhotoAsset{
 const doc=asset.cropStudio;
 if(!doc||(!doc.frame.presetId&&!doc.frame.borderThicknessMm))return asset;
 return {...asset,cropStudio:{...doc,frame:{
   ...doc.frame,presetId:undefined,borderThicknessMm:0,
 }}};
}
function roundedPath(x:number,y:number,w:number,h:number,r:number){
 const k=.552284749831;
 const q=Math.min(r,w/2,h/2);
 return [
   "M",x+q,y,
   "L",x+w-q,y,
   "C",x+w-q+k*q,y,x+w,y+q-k*q,x+w,y+q,
   "L",x+w,y+h-q,
   "C",x+w,y+h-q+k*q,x+w-q+k*q,y+h,x+w-q,y+h,
   "L",x+q,y+h,
   "C",x+q-k*q,y+h,x,y+h-q+k*q,x,y+h-q,
   "L",x,y+q,
   "C",x,y+q-k*q,x+q-k*q,y,x+q,y,
   "Z",
 ].join(" ");
}
/** Page graphics state is restored even if preset geometry or clipping fails.
 * Source/page physical millimeters are transformed as one PDF matrix, so
 * independent frame rotation remains correct in both page orientations. */
export function drawStudioFramePdf(
 page:PDFPage,asset:PhotoAsset,placement:Placement,pageHeightPt:number,
):void{
 const studio=asset.cropStudio;if(!studio)return;
 const f=studio.frame;
 if(!f.presetId&&!(f.borderThicknessMm>0&&f.borderOpacity>0))return;
 const pt=PDF_POINTS_PER_MM;
 const left=p(placement.xMm),top=pageHeightPt-p(placement.yMm);
 page.pushOperators(pushGraphicsState());
 try{
   // Cutout shapes clip decorative vector rails exactly like raster masks.
   if(asset.cropPolygon || (asset.cropShape&&asset.cropShape!=="rectangle")){
     const points=shapePolygonMm(asset.cropShape,placement.xMm,placement.yMm,
       placement.widthMm,placement.heightMm,!!placement.rotated,asset.cropPolygon);
     if(points.length){
       page.pushOperators(moveTo(p(points[0].x),pageHeightPt-p(points[0].y)));
       for(const vertex of points.slice(1))
         page.pushOperators(lineTo(p(vertex.x),pageHeightPt-p(vertex.y)));
       page.pushOperators(closePath(),clip(),endPath());
     }
   }
   if(placement.rotated){
     // Clockwise in print's top-left Y-down coordinate system.
     page.pushOperators(concatTransformationMatrix(0,-1,1,0,
       left+p(placement.widthMm),top));
   }else page.pushOperators(concatTransformationMatrix(1,0,0,1,left,top));
   const frameX=p(f.bounds.x*asset.widthMm);
   const frameTop=-p(f.bounds.y*asset.heightMm);
   const w=p(f.bounds.width*asset.widthMm),h=p(f.bounds.height*asset.heightMm);
   const midX=frameX+w/2,midY=frameTop-h/2;
   const theta=-rad(f.rotationDeg);
   const cs=Math.cos(theta),sn=Math.sin(theta);
   page.pushOperators(pushGraphicsState(),
     concatTransformationMatrix(cs,sn,-sn,cs,
       midX-midX*cs+midY*sn,midY-midX*sn-midY*cs));
   try{
     if(f.borderThicknessMm>0&&f.borderOpacity>0){
       const stroke=p(f.borderThicknessMm);
       const x=frameX+stroke/2,y=frameTop-h+stroke/2;
       const drawW=Math.max(0,w-stroke),drawH=Math.max(0,h-stroke);
       const radius=p(Math.max(0,f.radiusMm-f.borderThicknessMm/2));
       const outline=roundedPath(x,y,drawW,drawH,radius);
       page.drawSvgPath(outline,{
         x:0,y:0,borderWidth:stroke,borderColor:color(f.borderColor),
         borderOpacity:f.borderOpacity,
       });
     }
     if(f.presetId){
       drawFramePdf(page,{
         frameId:f.presetId,
         weight:1,widthMm:f.bounds.width*asset.widthMm,
         heightMm:f.bounds.height*asset.heightMm,
         left:frameX,top:frameTop,
         color:color(f.borderColor),opacity:f.borderOpacity,
       });
     }
   }finally{page.pushOperators(popGraphicsState());}
 }finally{page.pushOperators(popGraphicsState());}
}
