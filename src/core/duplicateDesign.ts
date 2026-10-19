import type { PhotoAsset } from "./exportPdf.ts";
/**
 * Multiple print designs may share one decoded original. Crop and layer geometry
 * are copied independently without duplicating compressed source image bytes.
 */
export function duplicatePrintDesign(asset:PhotoAsset,newId:string,layerIds:string[]):PhotoAsset{
 if(!newId||newId===asset.id||layerIds.length!==(asset.layers?.length??0))
   throw new Error("Invalid duplicate identifiers.");
 const extension=asset.name.lastIndexOf(".");
 const name=extension>0
   ? asset.name.slice(0,extension)+" copy"+asset.name.slice(extension)
   : asset.name+" copy";
 return {...asset,id:newId,name,crop:{...asset.crop},
   adjustments:asset.adjustments?{...asset.adjustments}:undefined,
   layers:asset.layers?.map((layer,index)=>({...layer,id:layerIds[index]})),
 };
}
/** A shared object URL must only be revoked when the last live design releases it. */
export function canRevokeImageUrl(url:string,otherAssets:readonly PhotoAsset[]):boolean{
 return !otherAssets.some(a=>a.url===url||a.processedUrl===url);
}
