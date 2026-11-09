import {renderMask,validBackgroundRecipe} from "../logic/backgroundRecipe.ts";
import type {BackgroundRecipe} from "../logic/backgroundRecipe.ts";
import {removeConnectedBackground} from "../logic/background.ts";
import type {RGB} from "../logic/background.ts";

export type BackgroundWorkerRequest =
  | {id:number;type:"mask";recipe:BackgroundRecipe;width:number;height:number}
  | {id:number;type:"export";recipe:BackgroundRecipe;source:Blob}
  | {id:number;type:"color";source:Uint8ClampedArray;width:number;height:number;sample:RGB;tolerance:number};
export type BackgroundWorkerReply =
  | {id:number;ok:true;type:"mask";alpha:Uint8Array}
  | {id:number;ok:true;type:"color";alpha:Uint8Array;removed:number}
  | {id:number;ok:true;type:"export";blob:Blob;width:number;height:number}
  | {id:number;ok:false;error:string};
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
async function finalPhoto(source:Blob,recipe:BackgroundRecipe){
 if(typeof OffscreenCanvas==="undefined")throw new Error("Full resolution output requires an OffscreenCanvas-enabled browser.");
 const image=await createImageBitmap(source);
 let background:ImageBitmap|undefined;
 try{
  const {width,height}=image;
  if(width*height>40_000_000||width>16000||height>16000||width<1||height<1)
    throw new Error("Image exceeds the supported 40 MP full-resolution export limit.");
  const memory=(navigator as Navigator & {deviceMemory?:number}).deviceMemory;
  if(memory!==undefined&&memory<=2&&width*height>12_000_000)
    throw new Error("This device has insufficient memory for this image at full resolution. Use a desktop or smaller original; no reduction was applied.");
  const full=new OffscreenCanvas(width,height);
  try{
    const output=full.getContext("2d",{alpha:true});
    if(!output)throw new Error("Could not initialize output canvas.");
    const backdrop=recipe.backdrop;
    if(backdrop.kind==="color"){
      output.fillStyle=backdrop.color??"#ffffff";output.fillRect(0,0,width,height);
    }else if(backdrop.kind==="image"&&backdrop.dataUrl){
      const blob=await(await fetch(backdrop.dataUrl)).blob();
      background=await createImageBitmap(blob);
      const fit=backdrop.fit??"cover";
      const scale=fit==="contain"?Math.min(width/background.width,height/background.height):
        Math.max(width/background.width,height/background.height);
      const bw=background.width*scale,bh=background.height*scale;
      const px=(width-bw)*((backdrop.offsetX??0)+1)/2;
      const py=(height-bh)*((backdrop.offsetY??0)+1)/2;
      output.drawImage(background,px,py,bw,bh);
    }
    const alpha=renderMask(recipe,width,height);
    refine(alpha,width,height,recipe);
    const tileRows=256;
    const tile=new OffscreenCanvas(width,Math.min(tileRows,height));
    try{
      const c=tile.getContext("2d",{willReadFrequently:true});
      if(!c)throw new Error("Could not initialize render tile.");
      for(let y=0;y<height;y+=tileRows){
        const rows=Math.min(tileRows,height-y);tile.height=rows;
        c.clearRect(0,0,width,rows);
        c.drawImage(image,0,y,width,rows,0,0,width,rows);
        const data=c.getImageData(0,0,width,rows);
        for(let yy=0;yy<rows;yy++)for(let x=0;x<width;x++){
          const i=(yy*width+x)*4,a=alpha[(y+yy)*width+x]/255;
          // Alpha replaces only the matte, not source RGB; preserve fine original detail.
          const srcAlpha=data.data[i+3];
          data.data[i+3]=Math.round(srcAlpha*a);
          if(recipe.decontam>0&&a>0&&a<1){
            // Suppress colored spill by borrowing neighboring foreground colors.
            const tx=Math.min(width-1,x+2),ti=(yy*width+tx)*4;
            const neighbor=alpha[(y+yy)*width+tx]/255;
            if(neighbor>a+.2){
              const strength=recipe.decontam*(1-a);
              for(let k=0;k<3;k++)data.data[i+k]=Math.round(
                data.data[i+k]*(1-strength)+data.data[ti+k]*strength);
            }
          }
        }
        c.putImageData(data,0,0);
        output.drawImage(tile,0,y);
      }
    }finally{tile.width=0;tile.height=0;}
    const blob=await full.convertToBlob({type:"image/png"});
    if(!blob.size)throw new Error("Full-resolution PNG encoding failed.");
    return {blob,width,height};
  }finally{full.width=0;full.height=0;}
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
       const result=await finalPhoto(job.source,job.recipe);
       ctx.postMessage({id:job.id,ok:true,type:"export",...result});
     }
   }catch(cause){ctx.postMessage({id:job.id,ok:false,error:cause instanceof Error?cause.message:"Background rendering failed."});}
 })();
};
