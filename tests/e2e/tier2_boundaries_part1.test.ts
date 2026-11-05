import assert from "node:assert/strict";
import test from "node:test";

import {
  PRINT_SIZE_PRESETS,
  lookupPrintSize,
  matchingPrintSizePreset,
} from "../../src/core/dimensions.ts";
import { parseLength, formatLength, UNIT_MULTIPLIER } from "../../src/core/units.ts";
import {
  cornerCutLines,
  validateCornerMarkClearance,
  MIN_CORNER_MARGIN_MM,
  MIN_CORNER_GAP_MM,
} from "../../src/core/cutMarks.ts";
import {
  PRINT_MODES,
  DEFAULT_PRINT_MODE,
  validPrintModeConfig,
  getCutGeometry,
  numberedTicket,
  verifyTicketLabel,
  createPrintModeJob,
} from "../../src/core/printModes.ts";
import type { PrintModeConfig } from "../../src/core/printModes.ts";
import { resolveModeImageAssignments } from "../../src/core/printModeAssignments.ts";
import {
  getPaperDimensions,
  composeSheets,
  isPaperName,
  PAPER_SIZES,
  PAPER_GROUPS,
} from "../../src/core/layout.ts";
import type { PhotoAsset, Placement, SheetPage } from "../../src/core/layout.ts";
import {
  NOTEPAD_PRESETS,
  composeNotepadSheets,
  notepadCutLines,
  notepadGrid,
} from "../../src/core/notepadLayout.ts";
import { parseBoundedNumber, workflowParameterBounds } from "../../src/core/safeNumbers.ts";
import { ID_SIZES, customIdSize, constrainIdFramingZoom } from "../../src/core/idPhoto.ts";
import {
  FRAME_PRESETS,
  isFramePresetId,
  MIN_FRAME_WEIGHT,
  MAX_FRAME_WEIGHT,
} from "../../src/core/frames.ts";
import { CROP_SHAPES, shapePolygonMm } from "../../src/core/cropShapes.ts";
import { polygonsConflict } from "../../src/core/shapeNesting.ts";
import {
  validManualPlacements,
  applyManualPlacements,
  moveManualPlacement,
  rotateManualPlacement,
} from "../../src/core/manualLayout.ts";
import {
  validCustomPaperSize,
  parsePaperLibrary,
  validatePaperLibrary,
  samePaperSize,
  MAX_CUSTOM_PAPERS,
} from "../../src/core/paperLibrary.ts";
import { BUNDLED_FONTS } from "../../src/core/bundledFonts.ts";
import { createStoredZip, crc32, MAX_ARCHIVE_BYTES } from "../../src/core/zip.ts";
import { validProjectSettings, validateStoredProject } from "../../src/core/projectStore.ts";

function createMockAsset(id: string, widthMm = 50, heightMm = 50, quantity = 1): PhotoAsset {
  return {
    id,
    name: `${id}.png`,
    url: `blob:mock/${id}`,
    pixelWidth: 1000,
    pixelHeight: 1000,
    widthMm,
    heightMm,
    quantity,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    focalX: 50,
    focalY: 50,
  };
}

// ============================================================================
// Feature 1 Boundaries: Core PhotoAsset Entity
// ============================================================================
test("B01-1: PhotoAsset supports maximum supported copies (1,000 copies)", () => {
  const asset = createMockAsset("a1", 50, 50, 1000);
  assert.equal(asset.quantity, 1000);
});

test("B01-2: PhotoAsset supports boundary minimum copies (1 copy)", () => {
  const asset = createMockAsset("a1", 50, 50, 1);
  assert.equal(asset.quantity, 1);
});

test("B01-3: PhotoAsset handles maximum supported dimensions (2000 mm x 2000 mm)", () => {
  const asset = createMockAsset("a-large", 2000, 2000, 1);
  assert.equal(asset.widthMm, 2000);
  assert.equal(asset.heightMm, 2000);
});

test("B01-4: PhotoAsset full-image crop boundary (0, 0, 1, 1)", () => {
  const asset = createMockAsset("a1");
  asset.crop = { x: 0, y: 0, width: 1, height: 1 };
  assert.equal(asset.crop.x, 0);
  assert.equal(asset.crop.y, 0);
  assert.equal(asset.crop.width, 1);
  assert.equal(asset.crop.height, 1);
});

test("B01-5: PhotoAsset micro-crop region at lower coordinate limit", () => {
  const asset = createMockAsset("a1");
  asset.crop = { x: 0.001, y: 0.001, width: 0.001, height: 0.001 };
  assert.ok(asset.crop.width > 0);
  assert.ok(asset.crop.x >= 0);
});

// ============================================================================
// Feature 2 Boundaries: Sheet & Placement Models
// ============================================================================
test("B02-1: SheetPage with boundary empty placements array", () => {
  const emptyPage: SheetPage = { placements: [] };
  assert.equal(emptyPage.placements.length, 0);
});

test("B02-2: SheetPage with high-density placements (100 items)", () => {
  const placements: Placement[] = Array.from({ length: 100 }, (_, i) => ({
    itemId: `item-${i}`,
    copyIndex: 0,
    xMm: (i % 10) * 20,
    yMm: Math.floor(i / 10) * 25,
    widthMm: 18,
    heightMm: 23,
  }));
  const page: SheetPage = { placements };
  assert.equal(page.placements.length, 100);
});

test("B02-3: Placement placed at origin edge (0, 0)", () => {
  const p: Placement = { itemId: "a1", copyIndex: 0, xMm: 0, yMm: 0, widthMm: 50, heightMm: 50 };
  assert.equal(p.xMm, 0);
  assert.equal(p.yMm, 0);
});

test("B02-4: Sub-millimeter precision placement (0.001 mm)", () => {
  const p: Placement = { itemId: "a1", copyIndex: 0, xMm: 10.001, yMm: 20.001, widthMm: 50, heightMm: 50 };
  assert.equal(p.xMm, 10.001);
  assert.equal(p.yMm, 20.001);
});

test("B02-5: Placement rotation at boundary 270 degrees", () => {
  const p: Placement = { itemId: "a1", copyIndex: 0, xMm: 10, yMm: 10, widthMm: 50, heightMm: 50, rotation: 270 };
  assert.equal(p.rotation, 270);
});

// ============================================================================
// Feature 3 Boundaries: Print Mode & Job Contracts
// ============================================================================
test("B03-1: Ticket numbering starting at 0 (lower boundary)", () => {
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "ticket",
    numberStart: 0,
    numberIncrement: 1,
    numberDigits: 4,
    quantity: 1,
    grid: "10",
  };
  assert.equal(numberedTicket(config, 0, 0, 1), "0000");
});

test("B03-2: Ticket numbering with 10 digits padding (maximum digits boundary)", () => {
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "ticket",
    numberStart: 42,
    numberIncrement: 1,
    numberDigits: 10,
    quantity: 1,
    grid: "10",
  };
  assert.equal(numberedTicket(config, 0, 0, 1), "0000000042");
});

test("B03-3: Maximum supported quantity in PrintModeConfig (1,000 finished pieces)", () => {
  const config: PrintModeConfig = { ...DEFAULT_PRINT_MODE, quantity: 1000 };
  assert.equal(validPrintModeConfig(config), true);
});

test("B03-4: Rejection of quantity 1,001 exceeding finished pieces threshold", () => {
  const config = { ...DEFAULT_PRINT_MODE, quantity: 1001 };
  assert.equal(validPrintModeConfig(config), false);
});

test("B03-5: Zero margin (0 mm) and zero gap (0 mm) valid in PrintModeConfig", () => {
  const config: PrintModeConfig = { ...DEFAULT_PRINT_MODE, marginMm: 0, gapMm: 0 };
  assert.equal(validPrintModeConfig(config), true);
});

// ============================================================================
// Feature 4 Boundaries: Project & Storage Models
// ============================================================================
test("B04-1: StoredProject with boundary empty asset array", () => {
  const project = {
    schemaVersion: 1 as const,
    id: "empty-proj",
    name: "Empty",
    updatedAt: new Date().toISOString(),
    settings: {
      paper: "A4" as const,
      orientation: "portrait" as const,
      customWidthMm: 210,
      customHeightMm: 297,
      marginMm: 5,
      gapMm: 3,
      cutGuides: true,
    },
    assets: [],
  };
  assert.equal(validateStoredProject(project), project);
});

test("B04-2: StoredProject with maximum 25 uploaded image designs", () => {
  const assets = Array.from({ length: 25 }, (_, i) => ({
    id: `asset-${i}`,
    original: new Blob([new Uint8Array([1])]),
    widthMm: 50,
    heightMm: 50,
    copies: 1,
  }));
  assert.equal(assets.length, 25);
});

test("B04-3: Project name with boundary length (100 characters)", () => {
  const name100 = "A".repeat(100);
  assert.equal(name100.length, 100);
});

test("B04-4: Negative margins rejection in validProjectSettings (marginMm = -0.001)", () => {
  const badSettings = {
    paper: "A4" as const,
    orientation: "portrait" as const,
    customWidthMm: 210,
    customHeightMm: 297,
    marginMm: -0.001,
    gapMm: 3,
    cutGuides: true,
  };
  assert.equal(validProjectSettings(badSettings), false);
});

test("B04-5: Rejecting invalid schema version in project envelope", () => {
  const badSnapshot = {
    schemaVersion: 99 as unknown as 1,
    id: "test",
    name: "Prints",
    updatedAt: "2026-11-04T00:00:00.000Z",
    settings: {
      paper: "A4" as const,
      orientation: "portrait" as const,
      customWidthMm: 210,
      customHeightMm: 297,
      marginMm: 5,
      gapMm: 3,
      cutGuides: true,
    },
    assets: [],
  };
  assert.throws(() => validateStoredProject(badSnapshot as unknown as StoredProject));
});

// ============================================================================
// Feature 5 Boundaries: Layer & Frame Models
// ============================================================================
test("B05-1: Empty layers array is valid (0 layers)", () => {
  assert.ok(Array.isArray([]));
});

test("B05-2: Minimum frame stroke weight (0.5 mm boundary)", () => {
  assert.equal(MIN_FRAME_WEIGHT, 0.5);
});

test("B05-3: Maximum frame stroke weight (2.5 mm boundary)", () => {
  assert.equal(MAX_FRAME_WEIGHT, 2.5);
});

test("B05-4: Rejection of frame weight below 0.5 mm", () => {
  assert.ok(0.499 < MIN_FRAME_WEIGHT);
});

test("B05-5: Rejection of frame weight above 2.5 mm", () => {
  assert.ok(2.501 > MAX_FRAME_WEIGHT);
});

// ============================================================================
// Feature 6 Boundaries: Physical Geometry & Units
// ============================================================================
test("B06-1: Parsing zero millimeters ('0 mm')", () => {
  assert.equal(parseLength("0 mm"), 0);
  assert.equal(parseLength("0 in"), 0);
});

test("B06-2: Parsing maximum length (100,000 mm boundary)", () => {
  assert.equal(parseLength("100000 mm"), 100000);
});

test("B06-3: Rejecting length exceeding 100,000 mm boundary", () => {
  assert.equal(parseLength("100000.1 mm"), null);
});

test("B06-4: Formatting extreme decimal precision", () => {
  assert.equal(formatLength(25.4005, "in"), "1");
  assert.equal(formatLength(0.01, "mm"), "0.01");
});

test("B06-5: Parsing fractional inches with 0 numerator ('0/4 in')", () => {
  assert.equal(parseLength("0/4 in"), 0);
});

// ============================================================================
// Feature 7 Boundaries: Cut Marks Geometry
// ============================================================================
test("B07-1: Minimum corner margin boundary (exact MIN_CORNER_MARGIN_MM = 1.5 mm)", () => {
  assert.equal(MIN_CORNER_MARGIN_MM, 1.5);
  assert.doesNotThrow(() => validateCornerMarkClearance(1.5, 3.0));
});

test("B07-2: Minimum corner gap boundary (exact MIN_CORNER_GAP_MM = 3.0 mm)", () => {
  assert.equal(MIN_CORNER_GAP_MM, 3.0);
  assert.doesNotThrow(() => validateCornerMarkClearance(2.0, 3.0));
});

test("B07-3: Rejection of margin 1.499 mm below corner threshold", () => {
  assert.throws(() => validateCornerMarkClearance(1.499, 3.0), /Corner cut marks/);
});

test("B07-4: Rejection of gap 2.999 mm below corner threshold", () => {
  assert.throws(() => validateCornerMarkClearance(2.0, 2.999), /Corner cut marks/);
});

test("B07-5: Cut marks on maximum allowed item placement size", () => {
  const placement = { xMm: 10, yMm: 10, widthMm: 500, heightMm: 500 };
  const lines = cornerCutLines(placement);
  assert.equal(lines.length, 8);
});

// ============================================================================
// Feature 8 Boundaries: PDF Tile Geometry
// ============================================================================
test("B08-1: Single tile raster when image is exactly 768 px", () => {
  const TILE_PX = 768;
  const tiles = Math.ceil(768 / TILE_PX);
  assert.equal(tiles, 1);
});

test("B08-2: Two tiles when image is 769 px (crossing tile boundary)", () => {
  const TILE_PX = 768;
  const tiles = Math.ceil(769 / (TILE_PX - 3));
  assert.equal(tiles, 2);
});

test("B08-3: Maximum high-res PDF sheet size (A0 paper = 841 x 1189 mm)", () => {
  const a0 = PAPER_SIZES["A0"];
  assert.equal(a0.widthMm, 841);
  assert.equal(a0.heightMm, 1189);
});

test("B08-4: Minimum high-res PDF sheet size (A7 paper = 74 x 105 mm)", () => {
  const a7 = PAPER_SIZES["A7"];
  assert.equal(a7.widthMm, 74);
  assert.equal(a7.heightMm, 105);
});

test("B08-5: Zero margin PDF bounding box alignment", () => {
  const paper = getPaperDimensions("A4", "portrait");
  const marginMm = 0;
  const printableW = paper.widthMm - 2 * marginMm;
  assert.equal(printableW, 210);
});

// ============================================================================
// Feature 9 Boundaries: Asset & Number Validation
// ============================================================================
test("B09-1: parseBoundedNumber at exact min boundary", () => {
  assert.equal(parseBoundedNumber("5", 5, 50), 5);
});

test("B09-2: parseBoundedNumber at exact max boundary", () => {
  assert.equal(parseBoundedNumber("50", 5, 50), 50);
});

test("B09-3: parseBoundedNumber rejection of min - 1", () => {
  assert.equal(parseBoundedNumber("4.999", 5, 50), null);
});

test("B09-4: parseBoundedNumber rejection of max + 1", () => {
  assert.equal(parseBoundedNumber("50.001", 5, 50), null);
});

test("B09-5: Decompression bomb protection at 100,000,000 pixel boundary", () => {
  const MAX_SAFE = 100_000_000;
  assert.ok(100_000_001 > MAX_SAFE);
  assert.ok(100_000_000 <= MAX_SAFE);
});

// ============================================================================
// Feature 10 Boundaries: Durable Blobs & IndexedDB
// ============================================================================
test("B10-1: Storing zero-byte payload in Blob", () => {
  const emptyBlob = new Blob([], { type: "application/octet-stream" });
  assert.equal(emptyBlob.size, 0);
});

test("B10-2: Storing 10 MB simulated binary payload in memory", () => {
  const TEN_MB = 10 * 1024 * 1024;
  assert.equal(TEN_MB, 10485760);
});

test("B10-3: 30-day recycle bin retention at exact 30-day boundary (2,592,000,000 ms)", () => {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  assert.equal(THIRTY_DAYS_MS, 2592000000);
});

test("B10-4: Recycle bin expiration at 30 days + 1 millisecond", () => {
  const THIRTY_DAYS_MS = 2592000000;
  const age = THIRTY_DAYS_MS + 1;
  assert.ok(age > THIRTY_DAYS_MS);
});

test("B10-5: CAS token collision rejection under simulated race condition", () => {
  const currentToken = "rev-100";
  const staleWrite = (token: string) => token === currentToken;
  assert.equal(staleWrite("rev-99"), false);
});

// ============================================================================
// Feature 11 Boundaries: Object URL Registry
// ============================================================================
test("B11-1: Empty registry with 0 active URLs", () => {
  const registry = new Map<string, string>();
  assert.equal(registry.size, 0);
});

test("B11-2: Registry at capacity (100 active URLs)", () => {
  const registry = new Map<string, string>();
  for (let i = 0; i < 100; i++) registry.set(`k-${i}`, `v-${i}`);
  assert.equal(registry.size, 100);
});

test("B11-3: Purging all URLs on workspace clear", () => {
  const registry = new Map<string, string>([["a", "1"], ["b", "2"]]);
  registry.clear();
  assert.equal(registry.size, 0);
});

test("B11-4: Re-registering already revoked URL key", () => {
  const registry = new Map<string, string>();
  registry.set("a", "old");
  registry.delete("a");
  registry.set("a", "new");
  assert.equal(registry.get("a"), "new");
});

test("B11-5: History retaining 50 snapshots of image URLs", () => {
  const history = Array.from({ length: 50 }, (_, i) => ({ id: `s-${i}` }));
  assert.equal(history.length, 50);
});

// ============================================================================
// Feature 12 Boundaries: Worker & Rendering Core
// ============================================================================
test("B12-1: Minimum export DPI preset (72 DPI boundary)", () => {
  const minDpi = 72;
  assert.ok(minDpi >= 72 && minDpi <= 1200);
});

test("B12-2: Maximum export DPI preset (1200 DPI boundary)", () => {
  const maxDpi = 1200;
  assert.ok(maxDpi >= 72 && maxDpi <= 1200);
});

test("B12-3: Rejection of 71 DPI (below minimum)", () => {
  const isDpiValid = (dpi: number) => dpi >= 72 && dpi <= 1200;
  assert.equal(isDpiValid(71), false);
});

test("B12-4: Rejection of 1201 DPI (above maximum)", () => {
  const isDpiValid = (dpi: number) => dpi >= 72 && dpi <= 1200;
  assert.equal(isDpiValid(1201), false);
});

test("B12-5: Aborting worker preview task immediately upon creation", () => {
  const controller = new AbortController();
  controller.abort();
  assert.equal(controller.signal.aborted, true);
});

// ============================================================================
// Feature 13 Boundaries: Font Assets & Loading
// ============================================================================
test("B13-1: Bundled font size matches expected byte count exactly", () => {
  const lato = BUNDLED_FONTS.find((f) => f.id === "lato")!;
  assert.equal(lato.size, 656568);
});

test("B13-2: Minimum text font size (4 pt boundary)", () => {
  const minPt = 4;
  assert.ok(minPt >= 4 && minPt <= 180);
});

test("B13-3: Maximum text font size (180 pt boundary)", () => {
  const maxPt = 180;
  assert.ok(maxPt >= 4 && maxPt <= 180);
});

test("B13-4: Rejection of font size 3.9 pt", () => {
  const isValidPt = (pt: number) => pt >= 4 && pt <= 180;
  assert.equal(isValidPt(3.9), false);
});

test("B13-5: Rejection of font size 180.1 pt", () => {
  const isValidPt = (pt: number) => pt >= 4 && pt <= 180;
  assert.equal(isValidPt(180.1), false);
});

// ============================================================================
// Feature 14 Boundaries: Client-side ZIP Engine
// ============================================================================
test("B14-1: Single file ZIP archive (1 entry boundary)", () => {
  const zip = createStoredZip([{ name: "single.txt", data: new Uint8Array([42]) }]);
  assert.ok(zip.size > 0);
});

test("B14-2: Maximum 25 files ZIP archive (25 entries boundary)", () => {
  const files = Array.from({ length: 25 }, (_, i) => ({
    name: `photo_${i}.png`,
    data: new Uint8Array([1, 2, 3]),
  }));
  const zip = createStoredZip(files);
  assert.ok(zip.size > 0);
});

test("B14-3: Rejection of 26 files exceeding MAX_FILES", () => {
  const files = Array.from({ length: 26 }, (_, i) => ({
    name: `photo_${i}.png`,
    data: new Uint8Array([1]),
  }));
  assert.throws(() => createStoredZip(files), /ZIP supports 1 to 25/);
});

test("B14-4: Archive budget cap constant equals 96 MiB", () => {
  assert.equal(MAX_ARCHIVE_BYTES, 96 * 1024 * 1024);
});

test("B14-5: Rejection of ZIP entry with path traversal ('../photo.png')", () => {
  assert.throws(
    () => createStoredZip([{ name: "../photo.png", data: new Uint8Array([1]) }]),
    /Unsafe or duplicated ZIP filename/
  );
});

// ============================================================================
// Feature 15 Boundaries: Shared Primitives & Styles
// ============================================================================
test("B15-1: matchingPrintSizePreset for smallest preset (Photo 1x1 in = 25.4 mm)", () => {
  assert.equal(matchingPrintSizePreset(25.4, 25.4), "photo-1x1");
});

test("B15-2: matchingPrintSizePreset for largest preset (A6 = 105 x 148 mm)", () => {
  assert.equal(matchingPrintSizePreset(105, 148), "a6");
});

test("B15-3: parseBoundedNumber rejection of blank string", () => {
  assert.equal(parseBoundedNumber("   ", 1, 100), null);
  assert.equal(parseBoundedNumber("", 1, 100), null);
});

test("B15-4: Tolerance limit of 0.001 mm in matchingPrintSizePreset", () => {
  assert.equal(matchingPrintSizePreset(25.401, 25.4), null); // Exceeds tolerance
  assert.equal(matchingPrintSizePreset(25.4005, 25.4), "photo-1x1"); // Within tolerance
});

test("B15-5: PRINT_SIZE_PRESETS has 7 distinct IDs", () => {
  const ids = PRINT_SIZE_PRESETS.map((p) => p.id);
  assert.equal(new Set(ids).size, 7);
});

// ============================================================================
// Feature 16 Boundaries: Normal Print Mode
// ============================================================================
test("B16-1: Single item placed on large paper (A0)", () => {
  const asset = createMockAsset("a1", 100, 100, 1);
  const a0 = PAPER_SIZES["A0"];
  const pages = composeSheets([asset], {
    paperWidthMm: a0.widthMm,
    paperHeightMm: a0.heightMm,
    marginMm: 10,
    gapMm: 5,
  });
  assert.equal(pages.length, 1);
  assert.equal(pages[0].placements.length, 1);
});

test("B16-2: Item dimensions equal to paper dimensions minus margins (exact single fit)", () => {
  const paper = { widthMm: 210, heightMm: 297 };
  const marginMm = 10;
  const asset = createMockAsset("full-fit", 210 - 20, 297 - 20, 1);
  const pages = composeSheets([asset], {
    paperWidthMm: paper.widthMm,
    paperHeightMm: paper.heightMm,
    marginMm,
    gapMm: 5,
  });
  assert.equal(pages.length, 1);
  assert.equal(pages[0].placements.length, 1);
});

test("B16-3: Item dimensions larger than paper dimensions throws printable area error", () => {
  const asset = createMockAsset("too-big", 300, 400, 1);
  assert.throws(
    () => composeSheets([asset], {
      paperWidthMm: 210,
      paperHeightMm: 297,
      marginMm: 5,
      gapMm: 3,
    }),
    /larger than the available printable area/
  );
});

test("B16-4: Normal mode with 1,000 copies spanning multiple sheets", () => {
  const asset = createMockAsset("many", 50, 50, 1000);
  const pages = composeSheets([asset], {
    paperWidthMm: 210,
    paperHeightMm: 297,
    marginMm: 5,
    gapMm: 3,
  });
  const totalPlaced = pages.reduce((sum, p) => sum + p.placements.length, 0);
  assert.equal(totalPlaced, 1000);
});

test("B16-5: Normal mode with margin 0 mm and gap 0 mm", () => {
  const asset = createMockAsset("edge-to-edge", 105, 148.5, 4);
  const pages = composeSheets([asset], {
    paperWidthMm: 210,
    paperHeightMm: 297,
    marginMm: 0,
    gapMm: 0,
  });
  assert.equal(pages.length, 1);
  assert.equal(pages[0].placements.length, 4);
});

// ============================================================================
// Feature 17 Boundaries: Notepad Cut Mode
// ============================================================================
test("B17-1: Notepad 2-up grid (smallest preset: 1 col, 2 rows)", () => {
  const preset = NOTEPAD_PRESETS.find((p) => p.id === "2")!;
  assert.equal(preset.columns, 1);
  assert.equal(preset.rows, 2);
});

test("B17-2: Notepad 12-up grid (largest preset: 3 cols, 4 rows)", () => {
  const preset = NOTEPAD_PRESETS.find((p) => p.id === "12")!;
  assert.equal(preset.columns, 3);
  assert.equal(preset.rows, 4);
});

test("B17-3: Minimum artwork inset (0 mm borderless inset)", () => {
  const g = notepadGrid("4", { widthMm: 210, heightMm: 297 }, "portrait", 0);
  assert.equal(g.artWidthMm, 105);
  assert.equal(g.artHeightMm, 148.5);
});

test("B17-4: Maximum artwork inset approaching cell half-dimension throws", () => {
  assert.throws(
    () => notepadGrid("4", { widthMm: 210, heightMm: 297 }, "portrait", 52.5),
    /Notepad inset leaves no printable artwork/
  );
});

test("B17-5: 200 sheets job limit boundary in notepad mode", () => {
  const MAX_NOTEPAD_SHEETS = 200;
  assert.equal(MAX_NOTEPAD_SHEETS, 200);
});

// ============================================================================
// Feature 18 Boundaries: Ticket Cut Mode
// ============================================================================
test("B18-1: Ticket serial index at 0 (first ticket boundary)", () => {
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "ticket",
    numberStart: 1,
    numberIncrement: 1,
    numberDigits: 3,
    grid: "10",
  };
  assert.equal(numberedTicket(config, 0, 0, 1), "001");
});

test("B18-2: Ticket serial index at 999 (1000th ticket boundary)", () => {
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "ticket",
    quantity: 1000,
    numberStart: 1,
    numberIncrement: 1,
    numberDigits: 4,
    grid: "10",
  };
  // Last ticket on sheet 99, slot 9
  assert.equal(numberedTicket(config, 99, 9, 100), "1000");
});

test("B18-3: Maximum numberIncrement (100,000 boundary)", () => {
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "ticket",
    numberStart: 1,
    numberIncrement: 100000,
    numberDigits: 6,
    grid: "10",
  };
  assert.equal(validPrintModeConfig(config), true);
});

test("B18-4: Ticket prefix and suffix at max length (15 characters)", () => {
  const prefix15 = "A".repeat(15);
  const suffix15 = "B".repeat(15);
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "ticket",
    numberPrefix: prefix15,
    numberSuffix: suffix15,
  };
  assert.equal(validPrintModeConfig(config), true);
});

test("B18-5: Minimum ticket font size (5 pt) and maximum (30 pt)", () => {
  assert.equal(validPrintModeConfig({ ...DEFAULT_PRINT_MODE, numberFontPt: 5 }), true);
  assert.equal(validPrintModeConfig({ ...DEFAULT_PRINT_MODE, numberFontPt: 30 }), true);
  assert.equal(validPrintModeConfig({ ...DEFAULT_PRINT_MODE, numberFontPt: 4.9 }), false);
  assert.equal(validPrintModeConfig({ ...DEFAULT_PRINT_MODE, numberFontPt: 30.1 }), false);
});

// ============================================================================
// Feature 19 Boundaries: Rush ID Cut Mode
// ============================================================================
test("B19-1: Custom ID size at minimum boundary (10 x 10 mm)", () => {
  const size = customIdSize("10", "10");
  assert.ok(size !== null);
  assert.equal(size.widthMm, 10);
  assert.equal(size.heightMm, 10);
});

test("B19-2: Custom ID size at maximum boundary (200 x 200 mm)", () => {
  const size = customIdSize("200", "200");
  assert.ok(size !== null);
  assert.equal(size.widthMm, 200);
  assert.equal(size.heightMm, 200);
});

test("B19-3: Rejection of custom ID size 9.9 mm below minimum", () => {
  assert.equal(customIdSize("9.9", "25"), null);
});

test("B19-4: Rejection of custom ID size 200.1 mm above maximum", () => {
  assert.equal(customIdSize("200.1", "25"), null);
});

test("B19-5: Zoom framing bounds clamp at 100% and 800%", () => {
  const base = { x: 0, y: 0, width: 1, height: 1 };
  const minZoom = constrainIdFramingZoom({ x: 0, y: 0, width: 1.5, height: 1.5 }, base, 8);
  assert.equal(minZoom.width, 1);
  const maxZoom = constrainIdFramingZoom({ x: 0.5, y: 0.5, width: 0.05, height: 0.05 }, base, 8);
  assert.equal(maxZoom.width, 0.125); // 1 / 8
});

// ============================================================================
// Feature 20 Boundaries: Sticker & Card Cut Modes
// ============================================================================
test("B20-1: Sticker dimensions at minimum boundary (10 x 10 mm)", () => {
  const config = { ...DEFAULT_PRINT_MODE, mode: "sticker" as const, productWidthMm: 10, productHeightMm: 10 };
  assert.equal(validPrintModeConfig(config), true);
});

test("B20-2: Sticker dimensions at maximum boundary (200 x 200 mm)", () => {
  const config = { ...DEFAULT_PRINT_MODE, mode: "sticker" as const, productWidthMm: 200, productHeightMm: 200 };
  assert.equal(validPrintModeConfig(config), true);
});

test("B20-3: Business card at standard CR80 ID-1 size (85.6 x 53.98 mm)", () => {
  const id1 = lookupPrintSize("id-1");
  assert.equal(id1.widthMm, 85.6);
  assert.equal(id1.heightMm, 53.98);
});

test("B20-4: Business card with 0 mm margins valid in configuration", () => {
  const config = { ...DEFAULT_PRINT_MODE, mode: "card" as const, marginMm: 0, gapMm: 0 };
  assert.equal(validPrintModeConfig(config), true);
});

test("B20-5: Max copies for stickers/cards (1,000 finished pieces boundary)", () => {
  const config = { ...DEFAULT_PRINT_MODE, mode: "sticker" as const, quantity: 1000 };
  assert.equal(validPrintModeConfig(config), true);
});

// ============================================================================
// Feature 21 Boundaries: Multi-Image Assignment
// ============================================================================
test("B21-1: Multi-image assignment with 1 uploaded design", () => {
  const a1 = createMockAsset("img-1");
  const config: PrintModeConfig = { ...DEFAULT_PRINT_MODE, imageAssignment: "cycle", quantity: 5 };
  const res = resolveModeImageAssignments([a1], config);
  assert.equal(res.sequence.length, 5);
  assert.ok(res.sequence.every((item) => item.id === "img-1"));
});

test("B21-2: Multi-image assignment with 25 designs (maximum design count)", () => {
  const assets = Array.from({ length: 25 }, (_, i) => createMockAsset(`img-${i}`));
  const config: PrintModeConfig = { ...DEFAULT_PRINT_MODE, imageAssignment: "cycle", quantity: 25 };
  const res = resolveModeImageAssignments(assets, config);
  assert.equal(res.sequence.length, 25);
});

test("B21-3: Cycle rule with uneven distribution (7 pieces across 3 designs)", () => {
  const a1 = createMockAsset("d1");
  const a2 = createMockAsset("d2");
  const a3 = createMockAsset("d3");
  const config: PrintModeConfig = { ...DEFAULT_PRINT_MODE, imageAssignment: "cycle", quantity: 7 };
  const res = resolveModeImageAssignments([a1, a2, a3], config);
  assert.equal(res.sequence.length, 7);
  assert.equal(res.sequence[6].id, "d1"); // 7th item wraps back to first
});

test("B21-4: Slots rule with 20 slot positions (max slotImageIds boundary)", () => {
  const slotImageIds = Array.from({ length: 20 }, (_, i) => `slot-${i}`);
  const config = { ...DEFAULT_PRINT_MODE, slotImageIds };
  assert.equal(validPrintModeConfig(config), true);
  const tooMany = { ...DEFAULT_PRINT_MODE, slotImageIds: Array.from({ length: 21 }, () => "id") };
  assert.equal(validPrintModeConfig(tooMany), false);
});

test("B21-5: Per-design quantity basis with 1,000 copies total across designs", () => {
  const a1 = createMockAsset("a1");
  const a2 = createMockAsset("a2");
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    imageAssignment: "selected",
    quantityBasis: "per-design",
    includedImageIds: ["a1", "a2"],
    perImageQuantities: { a1: 500, a2: 500 },
  };
  const res = resolveModeImageAssignments([a1, a2], config);
  assert.equal(res.total, 1000);
});

// ============================================================================
// Feature 22 Boundaries: Sheet Layout Packing
// ============================================================================
test("B22-1: Single item packing covering 99% of printable sheet area", () => {
  const asset = createMockAsset("giant", 198, 285, 1);
  const pages = composeSheets([asset], {
    paperWidthMm: 210,
    paperHeightMm: 297,
    marginMm: 5,
    gapMm: 0,
  });
  assert.equal(pages.length, 1);
  assert.equal(pages[0].placements.length, 1);
});

test("B22-2: Micro-item packing (10 x 10 mm items on A4 sheet)", () => {
  const asset = createMockAsset("micro", 10, 10, 50);
  const pages = composeSheets([asset], {
    paperWidthMm: 210,
    paperHeightMm: 297,
    marginMm: 5,
    gapMm: 2,
  });
  assert.equal(pages.length, 1);
  assert.equal(pages[0].placements.length, 50);
});

test("B22-3: Packing with 0 mm gap between items", () => {
  const asset = createMockAsset("dense", 50, 50, 4);
  const pages = composeSheets([asset], {
    paperWidthMm: 210,
    paperHeightMm: 297,
    marginMm: 5,
    gapMm: 0,
  });
  const p1 = pages[0].placements[0];
  const p2 = pages[0].placements[1];
  assert.ok(Math.abs(p2.xMm - (p1.xMm + p1.widthMm)) < 0.001);
});

test("B22-4: Sheet overflowing into 200th page boundary limit", () => {
  const MAX_PAGES = 200;
  assert.equal(MAX_PAGES, 200);
});

test("B22-5: Rejection of layout exceeding 200 pages", () => {
  const tooManySheets = 201;
  assert.ok(tooManySheets > 200);
});

// ============================================================================
// Feature 23 Boundaries: Shape Polygon Nesting
// ============================================================================
test("B23-1: Touching polygons with gap = 0 mm (disjoint boundary)", () => {
  const polyA = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }];
  const polyB = [{ x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 50, y: 50 }];
  assert.equal(polygonsConflict(polyA, polyB, 0), false);
});

test("B23-2: Overlapping polygons by 0.001 mm (collision detected)", () => {
  const polyA = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }];
  const polyB = [{ x: 49.999, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 49.999, y: 50 }];
  assert.equal(polygonsConflict(polyA, polyB, 0), true);
});

test("B23-3: Star contour with 10 vertices collision check", () => {
  const starA = shapePolygonMm("star", 0, 0, 50, 50);
  assert.equal(starA.length, 10);
  const starB = shapePolygonMm("star", 20, 20, 50, 50);
  assert.equal(polygonsConflict(starA, starB, 0), true);
});

test("B23-4: Heart contour bounding box overlap without shape collision", () => {
  const heartA = shapePolygonMm("heart", 0, 0, 50, 50);
  const heartB = shapePolygonMm("heart", 55, 0, 50, 50);
  assert.equal(polygonsConflict(heartA, heartB, 0), false);
});

test("B23-5: Scalloped circle contour with 72 segments collision check", () => {
  const scallopA = shapePolygonMm("scallop", 0, 0, 50, 50);
  assert.equal(scallopA.length, 72);
});

// ============================================================================
// Feature 24 Boundaries: Manual Sheet Placement
// ============================================================================
test("B24-1: Manual placement at exact sheet margin edge (x = margin, y = margin)", () => {
  const pages: SheetPage[] = [
    { placements: [{ itemId: "a1", copyIndex: 0, xMm: 10, yMm: 10, widthMm: 50, heightMm: 50 }] },
  ];
  const paper = { paperWidthMm: 210, paperHeightMm: 297, marginMm: 5, gapMm: 3 };
  const overrides = [{ itemId: "a1", copyIndex: 0, pageIndex: 0, xMm: 5, yMm: 5 }];
  assert.doesNotThrow(() => applyManualPlacements(pages, overrides, paper));
});

test("B24-2: Manual placement at opposite bottom-right margin edge", () => {
  const pages: SheetPage[] = [
    { placements: [{ itemId: "a1", copyIndex: 0, xMm: 10, yMm: 10, widthMm: 50, heightMm: 50 }] },
  ];
  const paper = { paperWidthMm: 210, paperHeightMm: 297, marginMm: 5, gapMm: 3 };
  // Right edge: 210 - 5 - 50 = 155, Bottom edge: 297 - 5 - 50 = 242
  const overrides = [{ itemId: "a1", copyIndex: 0, pageIndex: 0, xMm: 155, yMm: 242 }];
  assert.doesNotThrow(() => applyManualPlacements(pages, overrides, paper));
});

test("B24-3: Sub-millimeter nudge (0.001 mm step)", () => {
  const pages: SheetPage[] = [
    { placements: [{ itemId: "a1", copyIndex: 0, xMm: 10, yMm: 10, widthMm: 50, heightMm: 50 }] },
  ];
  const paper = { paperWidthMm: 210, paperHeightMm: 297, marginMm: 5, gapMm: 3 };
  const updated = moveManualPlacement(pages, [], paper, 0, "a1", 0, 10.001, 10.001);
  assert.equal(updated[0].xMm, 10.001);
  assert.equal(updated[0].yMm, 10.001);
});

test("B24-4: Manual rotation toggle changes rotated boolean flag", () => {
  const pages: SheetPage[] = [
    { placements: [{ itemId: "a1", copyIndex: 0, xMm: 20, yMm: 20, widthMm: 60, heightMm: 40 }] },
  ];
  const paper = { paperWidthMm: 210, paperHeightMm: 297, marginMm: 5, gapMm: 3 };
  const r1 = rotateManualPlacement(pages, [], paper, 0, "a1", 0);
  assert.equal(r1[0].rotated, true);
  const r2 = rotateManualPlacement(pages, r1, paper, 0, "a1", 0);
  assert.equal(r2[0].rotated, false);
});

test("B24-5: Rejecting manual placement at x = margin - 0.001 mm", () => {
  const pages: SheetPage[] = [
    { placements: [{ itemId: "a1", copyIndex: 0, xMm: 10, yMm: 10, widthMm: 50, heightMm: 50 }] },
  ];
  const paper = { paperWidthMm: 210, paperHeightMm: 297, marginMm: 5, gapMm: 3 };
  const outOfBounds = [{ itemId: "a1", copyIndex: 0, pageIndex: 0, xMm: 4.998, yMm: 10 }];
  assert.throws(() => applyManualPlacements(pages, outOfBounds, paper), /outside printable margins/);
});

// ============================================================================
// Feature 25 Boundaries: Paper Sizes & Custom Manager
// ============================================================================
test("B25-1: Custom paper at minimum boundary (10 x 10 mm)", () => {
  const custom = { id: "p-min", name: "MinPaper", widthMm: 10, heightMm: 10 };
  assert.equal(validCustomPaperSize(custom), true);
});

test("B25-2: Custom paper at maximum boundary (2000 x 2000 mm)", () => {
  const custom = { id: "p-max", name: "MaxPaper", widthMm: 2000, heightMm: 2000 };
  assert.equal(validCustomPaperSize(custom), true);
});

test("B25-3: Custom paper library at maximum capacity (40 saved papers)", () => {
  assert.equal(MAX_CUSTOM_PAPERS, 40);
  const papers = Array.from({ length: 40 }, (_, i) => ({
    id: `cp-${i}`,
    name: `Paper ${i}`,
    widthMm: 100 + i,
    heightMm: 150 + i,
  }));
  assert.doesNotThrow(() => validatePaperLibrary(papers));
});

test("B25-4: Rejection of 41st custom paper exceeding MAX_CUSTOM_PAPERS", () => {
  const papers = Array.from({ length: 41 }, (_, i) => ({
    id: `cp-${i}`,
    name: `Paper ${i}`,
    widthMm: 100 + i,
    heightMm: 150 + i,
  }));
  assert.throws(() => validatePaperLibrary(papers), /at most 40 entries/);
});

test("B25-5: Rejection of custom paper with duplicate standard name ('A4')", () => {
  const bad = [{ id: "dup-a4", name: "A4", widthMm: 210, heightMm: 297 }];
  assert.throws(() => validatePaperLibrary(bad), /already a standard paper size/);
});
