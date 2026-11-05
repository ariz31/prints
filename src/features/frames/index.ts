export { default as FrameSvg } from "./components/FrameSvg.tsx";
export { default } from "./components/FrameSvg.tsx";

export {
  FRAME_PRESETS,
  MIN_FRAME_WEIGHT,
  MAX_FRAME_WEIGHT,
  createFrameGeometry,
  type FramePrimitive,
  type FramePreset,
  type FrameCategory,
  type FramePoint,
  type FrameStroke,
} from "./logic/frames.ts";

export {
  drawFrameCanvas,
} from "./logic/frameCanvas.ts";

export {
  drawFramePdf,
} from "./logic/framePdf.ts";

export {
  SEASONAL_FRAME_PRESETS,
} from "./logic/seasonalFrames.ts";

export {
  createPremiumFrameGeometry,
} from "./logic/premiumFrameArt.ts";
