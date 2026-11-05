export { default as CropEditor } from "./components/CropEditor.tsx";
export { default } from "./components/CropEditor.tsx";
export { useCropRaster } from "./hooks/useCropRaster.ts";

export {
  FULL_CROP,
  normalizeCrop,
  fitCropToAspect,
  panCrop,
  zoomCrop,
  type CropRegion,
} from "./logic/crop.ts";

export {
  gestureCrop,
} from "./logic/cropGesture.ts";

export {
  CROP_SHAPES,
  cropShapePoints,
  shapeClipPath,
  shapePolygonMm,
  polygonArea,
  shapeAreaFraction,
  maskCropShape,
  validCropShape,
  type CropShape,
  type ShapePoint,
} from "./logic/cropShapes.ts";

export {
  liveCropImageStyle,
} from "./logic/liveCropPreview.ts";
