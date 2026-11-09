export { default as BackgroundEditor } from "./components/BackgroundEditorV2.tsx";
export { default } from "./components/BackgroundEditorV2.tsx";

export {
  featherAlphaMask,
  paintAlphaBrush,
  removeConnectedBackground,
  type RGB,
  type BrushMode,
} from "./logic/background.ts";

export {
  backgroundImageRect,
  backgroundPositionPercent,
  type BackdropFit,
} from "./logic/backgroundPlacement.ts";

export {
  SEGMENTATION_MODEL_NOTICE,
  applyPersonMask,
  segmentPersonLocally,
  type ForegroundMask,
} from "./logic/segmentationModel.ts";

export {
  MaskHistory,
} from "./logic/maskHistory.ts";
