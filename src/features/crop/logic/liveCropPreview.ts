import type {CropRegion} from "./crop.ts";
import type {PhotoAdjustments} from "../../../core/photoAdjustments.ts";
import {photoFilterCss,photoOpacityFraction,hasGeometryTransform,needsPixelProcessing} from "../../../core/photoAdjustments.ts";

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

/** Browser CSS can reproduce the live crop accurately only for simple
 * brightness/contrast/saturation/opacity. For pixel effects and geometry
 * transforms, display the decoded exact raster instead. */
export function canUseLiveCropPreview(adjustments?:PhotoAdjustments):boolean{
 return !hasGeometryTransform(adjustments)&&!needsPixelProcessing(adjustments);
}
