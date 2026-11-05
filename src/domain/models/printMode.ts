import type { Orientation, PaperName, SheetPage, TrimLine } from "./sheet.ts";
import type { PhotoAsset } from "./asset.ts";

export const PRINT_MODES = [
  { id: "normal", label: "Normal Print", description: "Photos and documents, fitted to paper", icon: "image" },
  { id: "notepad", label: "Notepad Cut", description: "Exact equal-cut sheet grids", icon: "grid" },
  { id: "ticket", label: "Ticket Cut", description: "Serials and cut-and-stack sheets", icon: "ticket" },
  { id: "rush-id", label: "Rush ID Cut", description: "1 × 1, 2 × 2 and passport photos", icon: "id" },
  { id: "sticker", label: "Sticker & Label Cut", description: "Repeated custom-sized stickers", icon: "sticker" },
  { id: "card", label: "Business Card Cut", description: "Standard/custom-size cards", icon: "card" },
] as const;

export type PrintModeId = (typeof PRINT_MODES)[number]["id"];
export type NumberingOrder = "cut-stack" | "sequential" | "repeat-sheet";
export type ImageAssignment = "first" | "cycle" | "selected" | "slots";
export type ModeQuantityBasis = "total" | "per-design";
export type NotepadPresetId = "2" | "3" | "4" | "6" | "8" | "9" | "10" | "12";

export interface PrintModeConfig {
  mode: PrintModeId;
  paper: PaperName;
  /** Legacy saved modes omit these fields. Custom mode requires both. */
  customWidthMm?: number;
  customHeightMm?: number;
  orientation: Orientation;
  quantity: number;
  marginMm: number;
  gapMm: number;
  cutGuides: boolean;
  dpi: number;
  grid: NotepadPresetId;
  idSize: string;
  productWidthMm: number;
  productHeightMm: number;
  imageAssignment: ImageAssignment;
  selectedImageId: string;
  slotImageIds: string[];
  /** Absent in older jobs: retain their original finished-pieces semantics. */
  quantityBasis?: ModeQuantityBasis;
  /** Used only in explicitly selected-design mode; stable source IDs, never indexes. */
  includedImageIds?: string[];
  /** Explicit count per design, with one copy for newly imported IDs by default. */
  perImageQuantities?: Record<string, number>;
  numberingOrder: NumberingOrder;
  numberStart: number;
  numberIncrement: number;
  numberDigits: number;
  numberPrefix: string;
  numberSuffix: string;
  numberX: number;
  numberY: number;
  numberFontPt: number;
}

export const DEFAULT_PRINT_MODE: PrintModeConfig = {
  mode: "normal",
  paper: "A4",
  customWidthMm: 210,
  customHeightMm: 297,
  orientation: "portrait",
  quantity: 1,
  marginMm: 5,
  gapMm: 3,
  cutGuides: true,
  dpi: 300,
  grid: "10",
  idSize: "id-2x2",
  productWidthMm: 50,
  productHeightMm: 30,
  imageAssignment: "first",
  selectedImageId: "",
  slotImageIds: [],
  numberingOrder: "cut-stack",
  numberStart: 1,
  numberIncrement: 1,
  numberDigits: 3,
  numberPrefix: "",
  numberSuffix: "",
  numberX: 50,
  numberY: 84,
  numberFontPt: 12,
};

export interface CutGeometry {
  columns: number;
  rows: number;
  perSheet: number;
  cellWidthMm: number;
  cellHeightMm: number;
  artWidthMm: number;
  artHeightMm: number;
}

export interface PrintModeJob {
  assets: PhotoAsset[];
  pages: SheetPage[];
  paper: { widthMm: number; heightMm: number };
  cuts?: TrimLine[];
  grid?: CutGeometry;
  total: number;
}

export interface ModeImageAssignment {
  selected: PhotoAsset[];
  sequence: PhotoAsset[];
  quantities: Map<string, number>;
  total: number;
  /** Includes intentional exclusions as well as designs with no allocated copies. */
  excluded: { id: string; name: string; reason: "not-selected" | "no-copies" }[];
}
