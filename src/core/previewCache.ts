import type {PhotoAsset} from "./exportPdf.ts";
/** Preview bytes change only for source image, physical crop and tone settings. */
export function cropPreviewKey(a:PhotoAsset):string{
 return JSON.stringify([
   a.id,a.url,a.pixelWidth,a.pixelHeight,
   a.processedUrl??null,a.processedWidth??null,a.processedHeight??null,
   a.widthMm,a.heightMm,a.crop,a.adjustments??null,
 ]);
}
