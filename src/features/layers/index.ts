export { default as LayerCanvas } from "./components/LayerCanvas.tsx";
export { default as LayerPanel } from "./components/LayerPanel.tsx";

export {
  MAX_DESIGN_LAYERS,
  newLayer,
  setFramePreset,
  validDesignLayers,
  layerRectMm,
  parseHexColor,
  type DesignLayer,
  type TextLayer,
  type ShapeLayer,
  type FrameLayer,
} from "./logic/layers.ts";

export {
  nudgeLayer,
} from "./logic/layerKeyboard.ts";

export {
  snapSelection,
  transformSelection,
  alignSelection,
} from "./logic/layerSelection.ts";

export {
  setLayerPercent,
} from "./logic/layerTransforms.ts";

export {
  makeShapedPdfPainter,
  shapePdfLine,
  type ShapedPdfLine,
} from "./logic/shapedPdfText.ts";
