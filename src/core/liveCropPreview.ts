import type {CropRegion} from "./crop.ts";
import type {PhotoAdjustments} from "./photoAdjustments.ts";
import {photoFilterCss,photoOpacityFraction} from "./photoAdjustments.ts";

/** Immediately paint the selected crop from the already-decoded local source.
 * This is an interactive fallback only; exports and Apply still require the
 * exact, decoded raster from the shared image pipeline. */
export function liveCropImageStyle(crop:CropRegion,adjustments?:PhotoAdjustments){
 return {
  width:(100/crop.width)+"%",height:(100/crop.height)+"%",
  left:(-100*crop.x/crop.width)+"%",top:(-100*crop.y/crop.height)+"%",
  filter:photoFilterCss(adjustments),opacity:photoOpacityFraction(adjustments),
 };
}
