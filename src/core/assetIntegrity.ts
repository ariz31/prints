import { fitCropToAspect } from "./crop.ts";
import type { PhotoAsset } from "./exportPdf.ts";

/** Image decoding may be much larger than compressed file bytes. */
export function assertSafeSourceSize(width:number,height:number):void {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||
      width<1||height<1||width>16000||height>16000||
      width*height>40_000_000) {
    throw new Error("Image dimensions exceed the 40-megapixel safe editing limit.");
  }
}
/** Reframe after changing the resolution of the edited image, preserving crop center. */
export function withProcessedImage(
  asset:PhotoAsset, processed:{url:string;width:number;height:number}|null,
):PhotoAsset {
  const width=processed?.width??asset.pixelWidth;
  const height=processed?.height??asset.pixelHeight;
  assertSafeSourceSize(width,height);
  const crop=fitCropToAspect(asset.crop,width,height,asset.widthMm,asset.heightMm);
  return {...asset,crop,processedUrl:processed?.url,
    processedWidth:processed?.width,processedHeight:processed?.height};
}
