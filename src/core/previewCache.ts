import type {PhotoAsset} from "./exportPdf.ts";
/** Preview bytes change only for source image, physical crop and tone settings. */
export function cropPreviewKey(a:PhotoAsset):string{
 return JSON.stringify([
   a.id,a.url,a.pixelWidth,a.pixelHeight,
   a.processedUrl??null,a.processedWidth??null,a.processedHeight??null,
   a.widthMm,a.heightMm,a.crop,a.adjustments??null,
 ]);
}

/** Rasterization failures belong to one item; a corrupt photo must not make
 * later thumbnails disappear. Supports canceling when workspace epoch changes. */
export async function processPreviewQueue<T>(
 items:readonly T[],
 process:(item:T)=>Promise<void>,
 onFailure:(item:T,error:unknown)=>void,
 cancelled:()=>boolean,
):Promise<void>{
 for(const item of items){
  if(cancelled())break;
  try {await process(item);}
  catch(error){if(cancelled())break;onFailure(item,error);}
 }
}

/** Cached current-crop raster and actual displayed URL must match. */
export type PreviewSourceStatus={kind:"ready"}|{kind:"pending"}|{kind:"failed";message:string};
export function previewSourceStatus(
 asset:PhotoAsset,
 cached:{key:string;url:string}|undefined,
 displayed:string|undefined,
 failure:{key:string;message:string}|undefined,
):PreviewSourceStatus{
 const key=cropPreviewKey(asset);
 if(failure?.key===key)return {kind:"failed",message:failure.message};
 return cached?.key===key&&cached.url===displayed?{kind:"ready"}:{kind:"pending"};
}

/** Progressive thumbnail fallback: prefer the generated crop, then processed
 * photo, then original. Failed URLs are skipped without poisoning later
 * generated URLs. The final fallback is a deliberate accessible placeholder. */
export function selectThumbnailSource(
  candidates:readonly (string|undefined)[],failed:ReadonlySet<string>,
):string|undefined{
  return [...new Set(candidates)].find((url):url is string=>
    typeof url==="string"&&url.length>0&&!failed.has(url));
}
