/** Retain Blob sources independently of ephemeral browser presentation URLs. */
const sources=new Map<string,Blob>();
export function registerPhotoBlob(url:string,blob:Blob):void{
 if(!url.startsWith("blob:")||!(blob instanceof Blob))
  throw new Error("Only local photo Blob URLs can be registered.");
 sources.set(url,blob);
}
export async function readPhotoBlob(url:string):Promise<Blob>{
 const retained=sources.get(url);
 if(retained)return retained;
 if(!url.startsWith("blob:"))
  throw new Error("A print image has an unsupported source. Reimport this photo.");
 try{
  const response=await fetch(url);
  if(!response.ok)throw new Error("Image URL no longer resolves.");
  const blob=await response.blob();
  sources.set(url,blob);return blob;
 }catch{
  throw new Error("A local photo source has expired. Reimport the affected image before saving.");
 }
}
export function releasePhotoBlobUrl(url:string):void{
 sources.delete(url);URL.revokeObjectURL(url);
}
