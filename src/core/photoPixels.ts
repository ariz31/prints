import type {PhotoAdjustments} from "./photoAdjustments.ts";
import {needsPixelProcessing,validPhotoAdjustments} from "./photoAdjustments.ts";
const clamp=(x:number)=>Math.max(0,Math.min(255,x));
/**
 * Deterministic local-pixel pipeline shared by photo editor, print preview, PNG, PDF, ZIP.
 * Applied AFTER existing legacy Canvas filter for compatibility, BEFORE vector layers.
 * Transparent alpha is immutable. No off-device processing or model download.
 */
export function processPhotoPixels(
 source:Uint8ClampedArray,width:number,height:number,a?:PhotoAdjustments,
):Uint8ClampedArray{
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||
   width*height>9_000_000||source.length!==width*height*4||
   (a!==undefined&&!validPhotoAdjustments(a)))
   throw new Error("Invalid advanced photo raster or adjustment metadata.");
 if(!needsPixelProcessing(a))return new Uint8ClampedArray(source);
 const output=new Uint8ClampedArray(source);
 const exp=Math.pow(2,(a?.exposure??0)/100);
 const shadows=(a?.shadows??0)/100,highlights=(a?.highlights??0)/100;
 const whites=(a?.whites??0)/100,blacks=(a?.blacks??0)/100;
 const temp=(a?.temperature??0)*.4,tint=(a?.tint??0)*.32;
 const vibrance=(a?.vibrance??0)/100,gray=(a?.grayscale??0)/100;
 const vignette=(a?.vignette??0)/100;
 const cx=(width-1)/2,cy=(height-1)/2;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const p=(y*width+x)*4;
  if(!source[p+3])continue;
  let r=source[p]*exp,g=source[p+1]*exp,b=source[p+2]*exp;
  let lum=(.2126*r+.7152*g+.0722*b)/255;
  const dark=Math.pow(1-Math.max(0,Math.min(1,lum)),2);
  const bright=Math.pow(Math.max(0,Math.min(1,lum)),2);
  const offset=shadows*80*dark+highlights*80*bright+
      blacks*55*Math.pow(dark,3)+whites*55*Math.pow(bright,3);
  r+=offset+temp+tint;g+=offset-tint;b+=offset-temp;
  const avg=(r+g+b)/3;
  const currentSat=Math.max(r,g,b)-Math.min(r,g,b);
  const vib=1+vibrance*(1-Math.min(1,currentSat/175));
  r=avg+(r-avg)*vib;g=avg+(g-avg)*vib;b=avg+(b-avg)*vib;
  if(gray){
   const l=.2126*r+.7152*g+.0722*b;
   r=r*(1-gray)+l*gray;g=g*(1-gray)+l*gray;b=b*(1-gray)+l*gray;
  }
  if(vignette){
   const dx=cx>0?(x-cx)/cx:0,dy=cy>0?(y-cy)/cy:0;
   const edge=Math.min(1,(dx*dx+dy*dy)/2);
   const factor=1-vignette*.70*Math.pow(edge,1.2);
   r*=factor;g*=factor;b*=factor;
  }
  output[p]=clamp(r);output[p+1]=clamp(g);output[p+2]=clamp(b);
 }
 const denoise=(a?.denoise??0)/100,sharp=(a?.sharpness??0)/100;
 if(!denoise&&!sharp)return output;
 const result=new Uint8ClampedArray(output);
 // 3x3 spatial blur with alpha-aware weights, sharpened from the exact same base.
 // Edge-preserving denoise avoids mixing high-contrast neighbors.
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const pos=(y*width+x)*4,alpha=output[pos+3];
  if(!alpha)continue;
  let sums=[0,0,0],weight=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const yy=y+dy,xx=x+dx;
   if(yy<0||yy>=height||xx<0||xx>=width)continue;
   const neighbor=(yy*width+xx)*4,otherAlpha=output[neighbor+3];
   if(!otherAlpha)continue;
   const diff=Math.abs(output[pos]-output[neighbor])+
    Math.abs(output[pos+1]-output[neighbor+1])+
    Math.abs(output[pos+2]-output[neighbor+2]);
   const w=(dx===0&&dy===0?2:1)*(otherAlpha/255)*
      (denoise>0?Math.exp(-diff/(40+denoise*160)):1);
   for(let k=0;k<3;k++)sums[k]+=w*output[neighbor+k];
   weight+=w;
  }
  for(let k=0;k<3;k++){
   const blur=sums[k]/Math.max(weight,1e-9);
   const original=output[pos+k];
   result[pos+k]=clamp(original+denoise*(blur-original)+
     sharp*.65*(original-blur));
  }
 }
 return result;
}
