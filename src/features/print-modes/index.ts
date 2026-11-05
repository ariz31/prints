export { default as PrintModeWorkspace } from "./components/PrintModeWorkspace.tsx";
export { default } from "./components/PrintModeWorkspace.tsx";
export { PrintModeSettings, PrintModeImageAssignments } from "./components/PrintModeWorkspace.tsx";
export { default as ModeImageAssignmentControls } from "./components/ModeImageAssignmentControls.tsx";

export {
  PRINT_MODES,
  DEFAULT_PRINT_MODE,
  createPrintModeJob,
  modeDefaults,
  getModePaperDimensions,
  validPrintModeConfig,
  type PrintModeId,
  type NumberingOrder,
  type ImageAssignment,
  type ModeQuantityBasis,
  type PrintModeConfig,
  type CutGeometry,
  type PrintModeJob,
  type NotepadPresetId,
} from "./logic/printModes.ts";

export {
  resolveModeImageAssignments,
  inspectModeImageCoverage,
  type ModeImageAssignment,
} from "./logic/printModeAssignments.ts";

export {
  validModePreset,
  readModePresets,
  saveModePresets,
  type SavedPrintMode,
} from "./logic/printModePresets.ts";
