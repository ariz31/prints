export {
  SheetPreview,
  type SheetPreviewProps,
} from "./components/SheetPreview.tsx";

export {
  composeSheets,
  getPaperDimensions,
  pageUtilization,
  type LayoutOptions,
  type Placement,
  type SheetPage,
  type PrintItemSpec,
  type TrimStyle,
  type TrimLine,
} from "./logic/layout.ts";

export {
  validManualPlacements,
  applyManualPlacements,
  moveManualPlacement,
  rotateManualPlacement,
  type ManualPlacement,
} from "./logic/manualLayout.ts";

export {
  NOTEPAD_PRESETS,
  NOTEPAD_CUT_GUIDE_STYLE,
  validNotepadPreset,
  notepadGrid,
  composeNotepadSheets,
  notepadCutLines,
  optimalSingleDesignCopies,
  type NotepadPresetId,
  type CutGrid,
} from "./logic/notepadLayout.ts";

export {
  reconcileSingleDesign,
  reconcilePaperSelection,
} from "./logic/paperReflow.ts";

export {
  composeShapeSheets,
  isActualShaped,
} from "./logic/shapeNesting.ts";

export {
  formatPreviewCaption,
  formatPreviewCheckStatus,
} from "./logic/previewCaption.ts";

export {
  selectPages,
} from "./logic/pageSelection.ts";
