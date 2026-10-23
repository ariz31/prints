import type { PhotoAsset } from "./exportPdf.ts";
import { rasterizeCrop, rasterDimensions } from "./imageRaster.ts";
import { validDesignLayers } from "./layers.ts";
import { textBoxGeometry,assertTextFits } from "./textLayout.ts";
import { PDF_POINTS_PER_MM } from "./layout.ts";
import {fontCssName,loadLocalFonts} from "./fontAssets.ts";

/** Rasterize one complete print product with its vector design layers. */
export async function exportDesignPng(asset: PhotoAsset,dpi=300):Promise<Blob>{
 if(!Number.isFinite(dpi)||dpi<72||dpi>600)
   throw new Error("PNG resolution must be between 72 and 600 DPI.");
 if(asset.layers!==undefined&&!validDesignLayers(asset.layers))
   throw new Error("Design layers contain invalid coordinates.");
 await loadLocalFonts(asset.layers??[]);
 const crop=await rasterizeCrop(asset,dpi);
 const bitmap=await createImageBitmap(crop);
 try{
   const {width,height}=rasterDimensions(asset.widthMm,asset.heightMm,dpi);
   const canvas=document.createElement("canvas");
   canvas.width=width;canvas.height=height;
   const ctx=canvas.getContext("2d");
   if(!ctx)throw new Error("Your browser does not support PNG export.");
   ctx.drawImage(bitmap,0,0,width,height);
   for(const layer of asset.layers??[]){
     if(!layer.visible)continue;
     const x=layer.x*width,y=layer.y*height,
       w=layer.width*width,h=layer.height*height;
     ctx.fillStyle=layer.color;
     if(layer.kind==="rectangle")ctx.fillRect(x,y,w,h);
     else if(layer.kind==="ellipse"){
       ctx.beginPath();ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);ctx.fill();
     }else if(layer.kind==="text"){
       const box=textBoxGeometry(layer,asset.widthMm,asset.heightMm);
       const pxPerPoint=width/(asset.widthMm*PDF_POINTS_PER_MM);
       const fontSizePx=box.fontSizePt*pxPerPoint;
       ctx.save();
       ctx.font=fontSizePx+"px "+fontCssName(layer);
       ctx.textBaseline="top";
       ctx.textAlign=layer.align??"left";
       const anchorX=layer.align==="center"?x+w/2:layer.align==="right"?x+w:x;
       ctx.shadowColor=layer.shadowPt?(layer.shadowColor??"#333333"):"transparent";
       ctx.shadowOffsetX=(layer.shadowPt??0)*pxPerPoint;
       ctx.shadowOffsetY=(layer.shadowPt??0)*pxPerPoint;
       ctx.lineJoin="round";
       ctx.lineWidth=(layer.outlinePt??0)*pxPerPoint*2;
       ctx.strokeStyle=layer.outlineColor??"#ffffff";
       assertTextFits(box,text=>ctx.measureText(text).width/pxPerPoint);
       for(let index=0;index<box.lines.length;index++){
         const top=y+index*box.lineHeightPt*pxPerPoint;
         if((layer.outlinePt??0)>0)ctx.strokeText(box.lines[index],anchorX,top);
         ctx.fillText(box.lines[index],anchorX,top);
       }
       ctx.restore();
     }
   }
   return await new Promise<Blob>((resolve,reject)=>{
     canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("PNG encoding failed.")),"image/png");
   });
 }finally{bitmap.close();}
}

/** A compact, repeatable naming convention for downloaded print products. */
export function outputPngName(fileName:string):string{
 const base=fileName.replace(/\.[^.]+$/,"").replace(/[^a-z0-9._-]+/gi,"-").slice(0,65);
 return (base||"prints-design")+".png";
}
