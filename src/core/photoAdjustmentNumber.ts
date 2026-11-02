import {parseBoundedNumber} from "./safeNumbers.ts";

/** Exact numeric entries in the photo editor must be integral and within the
 * physical adjustment's configured bounds; blank/intermediate edits remain
 * local until committed and never silently become zero. */
export function parsePhotoAdjustmentNumber(raw:string,min:number,max:number):number|null{
 return parseBoundedNumber(raw,min,max,true);
}
/** Revert invalid/incomplete edits to the last valid displayed value. */
export function resolvePhotoAdjustmentNumber(
 raw:string,current:number,min:number,max:number,
):number{
 return parsePhotoAdjustmentNumber(raw,min,max)??current;
}
