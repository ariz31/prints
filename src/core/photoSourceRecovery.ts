import type {PhotoAsset} from "./exportPdf.ts";
import {withProcessedImage} from "./assetIntegrity.ts";

/** Source choice is explicit: a preview may show an intact original only if
 * a failed processed source exists. It must not silently change PDF exports. */
export type PhotoSourceMode="primary"|"original"|"unavailable";
export function photoPreviewSource(item:Pick<PhotoAsset,"url"|"processedUrl">,
 mode:PhotoSourceMode):string|null {
 if(mode==="unavailable")return null;
 return mode==="original"?item.url:(item.processedUrl??item.url);
}
export function photoSourceFailureMode(
 item:Pick<PhotoAsset,"url"|"processedUrl">,
 failedUrl:string,
 mode:PhotoSourceMode,
):PhotoSourceMode {
 if(mode==="primary"&&item.processedUrl&&item.processedUrl!==item.url&&
    failedUrl===item.processedUrl)return "original";
 return "unavailable";
}
/** Never apply an adjustment derived from fallback bytes to a different
 * processed source used by the export engine. Repair requires a deliberate
 * change to the print design's processed image metadata. */
export function canCommitPhotoEdit(sourceMode:PhotoSourceMode,
 rasterPreviewFailed:boolean,visibleImageLoaded:boolean):boolean {
 return sourceMode==="primary"&&!rasterPreviewFailed&&visibleImageLoaded;
}

/** Align a preview-only original fallback to the exact crop that an explicit
 * Restore Original action will persist. Processed and original pixel sizes may
 * differ; keeping the processed crop would misrepresent the future print. */
export function photoPreviewAsset(item:PhotoAsset,mode:PhotoSourceMode):PhotoAsset {
 return mode==="original"?withProcessedImage(item,null):item;
}
