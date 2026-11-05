import type {PhotoAdjustments} from "./photoAdjustments.ts";

/** Cheap transient feedback while exact pixel processing runs off-thread.
 * This is never used to generate exported pixels. */
export function relativePreviewFilter(next:PhotoAdjustments,rendered:PhotoAdjustments):string|null{
 const ratio=(key:"brightness"|"contrast"|"saturation")=>{
  const old=(100+(rendered[key]??0))/100;
  const value=(100+(next[key]??0))/100;
  return old>0?value/old:null;
 };
 const brightness=ratio("brightness"),contrast=ratio("contrast"),saturation=ratio("saturation");
 if(brightness===null||contrast===null||saturation===null)return null;
 if([brightness,contrast,saturation].some(x=>!Number.isFinite(x)))return null;
 if([brightness,contrast,saturation].every(x=>Math.abs(x-1)<1e-8))return "none";
 return "brightness("+brightness+") contrast("+contrast+") saturate("+saturation+")";
}

/** Raster jobs may complete in order while Image.decode() finishes out of
 * order. Never let an older interactive result replace a final-quality
 * preview of the same parameters. Different crop/adjustment keys may replace
 * the prior result normally. */
export function shouldPublishPreviewResult(
 previous:{key:string;quality:"interactive"|"final"}|null,
 next:{key:string;quality:"interactive"|"final"},
):boolean{
 return !(previous?.key===next.key&&previous.quality==="final"&&next.quality==="interactive");
}
