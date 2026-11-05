export { default as PaperSizePicker } from "./components/PaperSizePicker.tsx";
export { default as CustomPaperManager } from "./components/CustomPaperManager.tsx";

export {
  PAPER_LIBRARY_KEY,
  MAX_CUSTOM_PAPERS,
  samePaperSize,
  validCustomPaperSize,
  parsePaperLibrary,
  validatePaperLibrary,
  readPaperLibrary,
  savePaperLibrary,
  type CustomPaperSize,
} from "./logic/paperLibrary.ts";

export type { PaperSelection } from "./components/PaperSizePicker.tsx";
