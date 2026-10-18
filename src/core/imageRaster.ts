import { coverSourceRect } from "./crop.ts";
import type { PhotoAsset } from "./exportPdf.ts";
import { MM_PER_INCH } from "./layout.ts";

function decodeImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to decode this image."));
    image.src = url;
  });
}

/**
 * Shared rasterization for previews and PDF embedding.
 * Source bytes stay unchanged. Avoid uncontrolled giant canvas allocations.
 */
export async function rasterizeCrop(asset: PhotoAsset, dpi: number): Promise<Blob> {
  const image = await decodeImage(asset.url);
  const requestedWidth = Math.max(1, Math.ceil(asset.widthMm / MM_PER_INCH * dpi));
  const requestedHeight = Math.max(1, Math.ceil(asset.heightMm / MM_PER_INCH * dpi));
  const scale = Math.min(1, 3000 / requestedWidth, 3000 / requestedHeight,
    Math.sqrt(9_000_000 / (requestedWidth * requestedHeight)));
  const width = Math.max(1, Math.round(requestedWidth * scale));
  const height = Math.max(1, Math.round(requestedHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is not available on this device.");
  const source = coverSourceRect(
    image.naturalWidth, image.naturalHeight, asset.crop, width, height, asset.focalX, asset.focalY,
  );
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = "high";
  context.drawImage(image, source.sx, source.sy, source.sw, source.sh, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Unable to encode this crop.")), "image/png");
  });
}
