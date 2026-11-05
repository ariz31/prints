import type { PrintItemSpec } from "./sheet.ts";
import type { CropRegion } from "./crop.ts";
import type { DesignLayer } from "./layers.ts";

/** Versioned, non-destructive photo adjustments. */
export interface LocalRetouch {
  /** Crop-local normalized coordinates; shown and placed in Print crop mode. */
  kind: "light" | "heal" | "red-eye";
  x: number;
  y: number;
  radius: number;
  strength: number;
}

export const PHOTO_EDIT_SCHEMA_VERSION = 1 as const;

export interface PhotoAdjustments {
  schemaVersion?: typeof PHOTO_EDIT_SCHEMA_VERSION;
  brightness: number;
  contrast: number;
  saturation: number;
  exposure?: number;
  highlights?: number;
  shadows?: number;
  whites?: number;
  blacks?: number;
  temperature?: number;
  tint?: number;
  vibrance?: number;
  sharpness?: number;
  denoise?: number;
  grayscale?: number;
  vignette?: number;
  rotation?: number;
  straighten?: number;
  flipX?: boolean;
  flipY?: boolean;
  regions?: LocalRetouch[];
  backgroundColor?: string;
  /** Source photo opacity: 0 fully transparent, 100 fully opaque. */
  opacity?: number;
}

export const DEFAULT_ADJUSTMENTS: PhotoAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
};

export interface PhotoAsset extends PrintItemSpec {
  name: string;
  url: string;
  pixelWidth: number;
  pixelHeight: number;
  crop: CropRegion;
  processedUrl?: string;
  processedWidth?: number;
  processedHeight?: number;
  layers?: DesignLayer[];
  adjustments?: PhotoAdjustments;
  focalX: number;
  focalY: number;
}

export type StoredAsset = Omit<PhotoAsset, "url" | "processedUrl"> & {
  original: Blob;
  processed?: Blob;
};

export type PreviewSource = Pick<
  PhotoAsset,
  | "url"
  | "processedUrl"
  | "crop"
  | "cropShape"
  | "widthMm"
  | "heightMm"
  | "pixelWidth"
  | "pixelHeight"
  | "processedWidth"
  | "processedHeight"
>;
