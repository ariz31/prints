import {renderMask,validBackgroundRecipe} from "../logic/backgroundRecipe.ts";
import type {BackgroundRecipe} from "../logic/backgroundRecipe.ts";
import {removeConnectedBackground} from "../logic/background.ts";
import {encodeRgbaPng} from "../../exports/logic/pngStream.ts";
import type {RGB} from "../logic/background.ts";

export type BackgroundWorkerRequest =
  | {id:number;type:"mask";recipe:BackgroundRecipe;width:number;height:number}
  | {id:number;type:"export";recipe:BackgroundRecipe;source:Blob}
  | {id:number;type:"color";source:Uint8ClampedArray;width:number;height:number;sample:RGB;tolerance:number};
export type BackgroundWorkerReply =
  | {id:number;ok:true;type:"progress";done:number;total:number}
  | {id:number;ok:true;type:"mask";alpha:Uint8Array}
  | {id:number;ok:true;type:"color";alpha:Uint8Array;removed:number}
  | {id:number;ok:true;type:"export";blob:Blob;width:number;height:number}
  | {id:number;ok:false;type:"error";error:string};
const ctx=self as unknown as {
  onmessage:((event:MessageEvent<BackgroundWorkerRequest>)=>void)|null;
  postMessage:(response:BackgroundWorkerReply,transfer?:Transferable[])=>void;
};
/** Mask feather/contract uses alpha-only buffers; source RGB stays immutable. */
function refine(alpha:Uint8Array,width:number,height:number,recipe:BackgroundRecipe):void{
 const contract=recipe.contract;
 if(contract!==0){
   const copy=alpha.slice(),distance=Math.abs(contract);
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){
     let value=contract>0?255:0;
     for(let dy=-distance;dy<=distance;dy++)for(let dx=-distance;dx<=distance;dx++){
       if(dx*dx+dy*dy>distance*distance)continue;
       const p=(Math.min(height-1,Math.max(0,y+dy))*width+Math.min(width-1,Math.max(0,x+dx)));
       value=contract>0?Math.min(value,copy[p]):Math.max(value,copy[p]);
     }
     alpha[y*width+x]=value;
   }
 }
 if(recipe.feather>0){
   const tmp=alpha.slice(),r=recipe.feather;
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){
     let sum=0,n=0;
     for(let dx=-r;dx<=r;dx++){const px=x+dx;if(px>=0&&px<width){sum+=tmp[y*width+px];n++;}}
     alpha[y*width+x]=Math.round(sum/n);
   }
   tmp.set(alpha);
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){
     let sum=0,n=0;
     for(let dy=-r;dy<=r;dy++){const py=y+dy;if(py>=0&&py<height){sum+=tmp[py*width+x];n++;}}
     alpha[y*width+x]=Math.round(sum/n);
   }
 }
}
/** Stream full-resolution PNG stripes. The source decode is browser-managed,
 * while JS allocations are limited to an alpha plane and 2 short RGBA tiles. */
async function finalPhoto(source:Blob,recipe:BackgroundRecipe,
 onProgress:(done:number,total:number)=>void){
 if(typeof OffscreenCanvas==="undefined"||typeof CompressionStream==="undefined")
   throw new Error("This browser cannot stream full-resolution PNGs. Use a current Chrome, Safari or Firefox version.");
 const image=await createImageBitmap(source);
 let background:ImageBitmap|undefined;
 try{
  const {width,height}=image;
  if(width*height>40_000_000||width>16000||height>16000||width<1||height<1)
    throw new Error("Image exceeds the supported 40 MP full-resolution export limit.");
  const memory=(navigator as Navigator & {deviceMemory?:number}).deviceMemory;
  if(memory!==undefined&&memory<=2&&width*height>12_000_000)
    throw new Error("This device has insufficient memory for this image at full resolution. Use a desktop or smaller original; no reduction was applied.");
  const backdrop=recipe.backdrop;
  if(backdrop.kind==="image"&&backdrop.dataUrl){
    const bytes=await(await fetch(backdrop.dataUrl)).blob();
    background=await createImageBitmap(bytes);
    if(background.width>6000||background.height>6000||background.width*background.height>16_000_000)
      throw new Error("Background image exceeds the safe 16 MP limit.");
  }
  const alpha=renderMask(recipe,width,height);
  refine(alpha,width,height,recipe);
  const tileRows=64;
  const cutout=new OffscreenCanvas(width,Math.min(tileRows,height));
  const composed=new OffscreenCanvas(width,Math.min(tileRows,height));
  try{
    const foreground=cutout.getContext("2d",{willReadFrequently:true});
    const output=composed.getContext("2d",{willReadFrequently:true});
    if(!foreground||!output)throw new Error("Could not initialize render tiles.");
    // Same backdrop transform for every stripe avoids visible horizontal seams.
    let bx=0,by=0,bw=0,bh=0;
    if(background){
      const scale=(backdrop.fit??"cover")==="contain"
        ?Math.min(width/background.width,height/background.height)
        :Math.max(width/background.width,height/background.height);
      bw=background.width*scale;bh=background.height*scale;
      bx=(width-bw)*((backdrop.offsetX??0)+1)/2;
      by=(height-bh)*((backdrop.offsetY??0)+1)/2;
    }
    const readStripe=(y:number,rows:number):Uint8Array=>{
      cutout.height=rows;composed.height=rows;
      foreground.clearRect(0,0,width,rows);
      foreground.drawImage(image,0,y,width,rows,0,0,width,rows);
      const data=foreground.getImageData(0,0,width,rows);
      for(let yy=0;yy<rows;yy++)for(let x=0;x<width;x++){
        const i=(yy*width+x)*4,a=alpha[(y+yy)*width+x]/255;
        const srcAlpha=data.data[i+3];
        data.data[i+3]=Math.round(srcAlpha*a);
        if(recipe.decontam>0&&a>0&&a<1){
          let candidate=-1,best=a+.2;
          for(let step=1;step<=3;step++)for(const [dx,dy] of [
            [-step,0],[step,0],[0,-step],[0,step]
          ]){
            const px=x+dx,py=yy+dy;
            if(px<0||px>=width||py<0||py>=rows)continue;
            const confidence=alpha[(y+py)*width+px]/255;
            if(confidence>best){best=confidence;candidate=(py*width+px)*4;}
          }
          if(candidate>=0){
            const strength=recipe.decontam*(1-a);
            for(let k=0;k<3;k++)data.data[i+k]=Math.round(
              data.data[i+k]*(1-strength)+data.data[candidate+k]*strength);
          }
        }
      }
      foreground.putImageData(data,0,0);
      output.clearRect(0,0,width,rows);
      if(backdrop.kind==="color"){
        output.fillStyle=backdrop.color??"#ffffff";
        output.fillRect(0,0,width,rows);
      }else if(background){
        output.drawImage(background,bx,by-y,bw,bh);
      }
      output.drawImage(cutout,0,0);
      return new Uint8Array(output.getImageData(0,0,width,rows).data);
    };
    const blob=await encodeRgbaPng(width,height,readStripe,300,{onProgress});
    if(!blob.size)throw new Error("Full-resolution PNG encoding failed.");
    return {blob,width,height};
  }finally{cutout.width=0;cutout.height=0;composed.width=0;composed.height=0;}
 }finally{image.close();background?.close();}
}

ctx.onmessage=event=>{
 const job=event.data;
 if(!job||!Number.isSafeInteger(job.id)||
   (job.type!=="color"&&!validBackgroundRecipe(job.recipe)))return;
 void (async()=>{
   try{
     if(job.type==="color"){
       const result=removeConnectedBackground(job.source,job.width,job.height,job.sample,job.tolerance);
       const alpha=new Uint8Array(job.width*job.height);
       for(let i=0;i<alpha.length;i++){
         const base=job.source[i*4+3];
         alpha[i]=base?Math.min(255,Math.round(result.pixels[i*4+3]/base*255)):0;
       }
       ctx.postMessage({id:job.id,ok:true,type:"color",alpha,removed:result.removed},[alpha.buffer]);
     }else if(job.type==="mask"){
       const alpha=renderMask(job.recipe,job.width,job.height);
       refine(alpha,job.width,job.height,job.recipe);
       ctx.postMessage({id:job.id,ok:true,type:"mask",alpha},[alpha.buffer]);
     }else if(job.type==="export"){
       const result=await finalPhoto(job.source,job.recipe,(done,total)=>
         ctx.postMessage({id:job.id,ok:true,type:"progress",done,total}));
       ctx.postMessage({id:job.id,ok:true,type:"export",...result});
     }
   }catch(cause){ctx.postMessage({id:job.id,ok:false,type:"error",error:cause instanceof Error?cause.message:"Background rendering failed."});}
 })();
};
