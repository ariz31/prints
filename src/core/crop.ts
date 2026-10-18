/**
 * Crop coordinates are normalized fractions of the decoded source image.
 * Keeping these independent of the print canvas avoids accidental pixel/CSS scaling.
 */
export interface CropRegion { x: number; y: number; width: number; height: number }

export const FULL_CROP: CropRegion = { x: 0, y: 0, width: 1, height: 1 };

export function normalizeCrop(crop: CropRegion): CropRegion {
  if (![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)) return { ...FULL_CROP };
  const x = Math.max(0, Math.min(0.99, crop.x));
  const y = Math.max(0, Math.min(0.99, crop.y));
  const width = Math.max(0.01, Math.min(1 - x, crop.width));
  const height = Math.max(0.01, Math.min(1 - y, crop.height));
  return { x, y, width, height };
}

export function dragCrop(
  start: { x: number; y: number }, end: { x: number; y: number },
  minExtent = 0.01,
): CropRegion {
  const sx = Math.max(0, Math.min(1, start.x));
  const sy = Math.max(0, Math.min(1, start.y));
  const ex = Math.max(0, Math.min(1, end.x));
  const ey = Math.max(0, Math.min(1, end.y));
  const left = Math.min(sx, ex);
  const top = Math.min(sy, ey);
  return normalizeCrop({
    x: left, y: top,
    width: Math.max(minExtent, Math.abs(ex - sx)),
    height: Math.max(minExtent, Math.abs(ey - sy)),
  });
}

/** Source rectangle after user crop and object-fit cover, in source image pixels. */
export function coverSourceRect(
  naturalWidth: number, naturalHeight: number, crop: CropRegion,
  outputWidth: number, outputHeight: number, focalX = 50, focalY = 50,
) {
  if (![naturalWidth, naturalHeight, outputWidth, outputHeight].every(
    (x) => Number.isFinite(x) && x > 0,
  )) throw new Error("Image and output dimensions must be positive.");
  const c = normalizeCrop(crop);
  const initialW = naturalWidth * c.width;
  const initialH = naturalHeight * c.height;
  const ratio = outputWidth / outputHeight;
  let sw = initialW;
  let sh = initialH;
  if (initialW / initialH > ratio) sw = initialH * ratio;
  else sh = initialW / ratio;
  const fx = Math.max(0, Math.min(1, focalX / 100));
  const fy = Math.max(0, Math.min(1, focalY / 100));
  return {
    sx: naturalWidth * c.x + (initialW - sw) * fx,
    sy: naturalHeight * c.y + (initialH - sh) * fy,
    sw, sh,
  };
}
