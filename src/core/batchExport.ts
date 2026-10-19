import type {PhotoAsset} from "./exportPdf.ts";
import {exportDesignPng,outputPngName} from "./exportPng.ts";
import {createStoredZip} from "./zip.ts";
export interface BatchOptions{
 dpi?:number;
 onProgress?:(finished:number,total:number)=>void;
 signal?:AbortSignal;
 maxBytes?:number;
}
/** Sequential rasterization prevents many canvas buffers being held simultaneously. */
export async function exportBatchPngZip(
 assets:readonly PhotoAsset[],options:BatchOptions={},
 render:(asset:PhotoAsset,dpi:number)=>Promise<Blob>=exportDesignPng,
):Promise<Blob>{
 if(!assets.length||assets.length>25)throw new Error("Export between 1 and 25 designs per batch.");
 const dpi=options.dpi??300;
 if(!Number.isFinite(dpi)||dpi<72||dpi>600)throw new Error("DPI must be 72 to 600.");
 const files:{name:string;data:Uint8Array}[]=[];
 options.onProgress?.(0,assets.length);
 for(let i=0;i<assets.length;i++){
  if(options.signal?.aborted)throw new Error("Batch export canceled.");
  const blob=await render(assets[i],dpi);
  if(options.signal?.aborted)throw new Error("Batch export canceled.");
  if(blob.type!=="image/png"||!blob.size)throw new Error("Image renderer returned an invalid PNG.");
  files.push({name:String(i+1).padStart(2,"0")+"-"+outputPngName(assets[i].name),
    data:new Uint8Array(await blob.arrayBuffer())});
  options.onProgress?.(i+1,assets.length);
 }
 if(options.signal?.aborted)throw new Error("Batch export canceled.");
 return createStoredZip(files,options.maxBytes);
}
