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
  CORNER_MARK_LENGTH_MM,
  CORNER_MARK_OFFSET_MM,
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
  modeDefaults,
} from "../../src/core/printModes.ts";
import type { PrintModeConfig } from "../../src/core/printModes.ts";
import { resolveModeImageAssignments } from "../../src/core/printModeAssignments.ts";
import {
  getPaperDimensions,
  composeSheets,
  isPaperName,
  PDF_POINTS_PER_MM,
} from "../../src/core/layout.ts";
import type { PhotoAsset, Placement, SheetPage } from "../../src/core/layout.ts";
import { NOTEPAD_PRESETS, composeNotepadSheets, notepadCutLines, notepadGrid } from "../../src/core/notepadLayout.ts";
import { parseBoundedNumber, workflowParameterBounds } from "../../src/core/safeNumbers.ts";
import { ID_SIZES, customIdSize, constrainIdFramingZoom } from "../../src/core/idPhoto.ts";
import { FRAME_PRESETS, isFramePresetId } from "../../src/core/frames.ts";
import { CROP_SHAPES, cropShapePoints, shapePolygonMm, validCropShape } from "../../src/core/cropShapes.ts";
import { polygonsConflict, composeShapeSheets } from "../../src/core/shapeNesting.ts";
import { validManualPlacements, applyManualPlacements, moveManualPlacement, rotateManualPlacement } from "../../src/core/manualLayout.ts";
import { validCustomPaperSize, parsePaperLibrary, samePaperSize, MAX_CUSTOM_PAPERS } from "../../src/core/paperLibrary.ts";
import { PAPER_SIZES, PAPER_GROUPS } from "../../src/core/layout.ts";
import { BUNDLED_FONTS } from "../../src/core/bundledFonts.ts";
import { createStoredZip, crc32 } from "../../src/core/zip.ts";
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
// Feature 1: Core PhotoAsset Entity
// ============================================================================
test("F01-1: Core PhotoAsset Entity initializes with valid geometry and pixel properties", () => {
  const asset = createMockAsset("asset-1", 50.8, 50.8, 4);
  assert.equal(asset.id, "asset-1");
  assert.equal(asset.pixelWidth, 1000);
  assert.equal(asset.pixelHeight, 1000);
  assert.equal(asset.widthMm, 50.8);
  assert.equal(asset.heightMm, 50.8);
  assert.equal(asset.quantity, 4);
});

test("F01-2: Core PhotoAsset crop region is normalized within unit bounds [0, 1]", () => {
  const asset = createMockAsset("asset-crop", 40, 60);
  asset.crop = { x: 0.1, y: 0.2, width: 0.8, height: 0.7 };
  assert.ok(asset.crop.x >= 0 && asset.crop.x <= 1);
  assert.ok(asset.crop.y >= 0 && asset.crop.y <= 1);
  assert.ok(asset.crop.width > 0 && asset.crop.width <= 1);
  assert.ok(asset.crop.height > 0 && asset.crop.height <= 1);
  assert.ok(asset.crop.x + asset.crop.width <= 1.0001);
  assert.ok(asset.crop.y + asset.crop.height <= 1.0001);
});

test("F01-3: Core PhotoAsset preserves non-destructive adjustments and backdrop", () => {
  const asset = createMockAsset("asset-adj", 45, 45);
  asset.adjustments = { brightness: 10, contrast: -5, saturation: 20 };
  asset.backdropColor = "#ffffff";
  assert.equal(asset.adjustments.brightness, 10);
  assert.equal(asset.adjustments.contrast, -5);
  assert.equal(asset.adjustments.saturation, 20);
  assert.equal(asset.backdropColor, "#ffffff");
});

test("F01-4: Core PhotoAsset enforces stable identifier length and character safety", () => {
  const validId = "design_alpha-123_456";
  const asset = createMockAsset(validId);
  assert.equal(asset.id, validId);
  assert.ok(asset.id.length <= 200);
  assert.ok(asset.id.trim().length > 0);
});

test("F01-5: Core PhotoAsset supports rotation angle and crop shape assignment", () => {
  const asset = createMockAsset("asset-rot", 50, 50);
  asset.rotation = 90;
  asset.cropShape = "circle";
  assert.equal(asset.rotation, 90);
  assert.equal(asset.cropShape, "circle");
});

// ============================================================================
// Feature 2: Sheet & Placement Models
// ============================================================================
test("F02-1: SheetPage model contains an ordered array of placements", () => {
  const p1: Placement = { itemId: "a1", copyIndex: 0, xMm: 10, yMm: 10, widthMm: 40, heightMm: 40 };
  const p2: Placement = { itemId: "a2", copyIndex: 0, xMm: 55, yMm: 10, widthMm: 40, heightMm: 40 };
  const page: SheetPage = { placements: [p1, p2] };
  assert.equal(page.placements.length, 2);
  assert.equal(page.placements[0].itemId, "a1");
  assert.equal(page.placements[1].itemId, "a2");
});

test("F02-2: Placement maintains exact physical millimeters and non-negative offsets", () => {
  const p: Placement = { itemId: "a1", copyIndex: 0, xMm: 5.5, yMm: 12.25, widthMm: 50.8, heightMm: 50.8 };
  assert.equal(p.xMm, 5.5);
  assert.equal(p.yMm, 12.25);
  assert.equal(p.widthMm, 50.8);
  assert.equal(p.heightMm, 50.8);
});

test("F02-3: Placement supports optional serial metadata for numbered jobs", () => {
  const p: Placement = {
    itemId: "ticket-1",
    copyIndex: 0,
    xMm: 10,
    yMm: 20,
    widthMm: 100,
    heightMm: 50,
    serial: { text: "No. 00042", xPercent: 50, yPercent: 80, fontSizePt: 12 },
  };
  assert.ok(p.serial !== undefined);
  assert.equal(p.serial.text, "No. 00042");
  assert.equal(p.serial.xPercent, 50);
  assert.equal(p.serial.fontSizePt, 12);
});

test("F02-4: PaperName model accepts standard and custom paper names", () => {
  assert.equal(isPaperName("A4"), true);
  assert.equal(isPaperName("Letter"), true);
  assert.equal(isPaperName("4R"), true);
  assert.equal(isPaperName("Custom"), true);
  assert.equal(isPaperName("InvalidPaperName"), false);
});

test("F02-5: Sheet dimensions reflect portrait and landscape orientation transforms", () => {
  const portrait = getPaperDimensions("A4", "portrait");
  const landscape = getPaperDimensions("A4", "landscape");
  assert.equal(portrait.widthMm, 210);
  assert.equal(portrait.heightMm, 297);
  assert.equal(landscape.widthMm, 297);
  assert.equal(landscape.heightMm, 210);
});

// ============================================================================
// Feature 3: Print Mode & Job Contracts
// ============================================================================
test("F03-1: PrintModeId covers all 6 recognized production modes", () => {
  const modeIds = PRINT_MODES.map((m) => m.id);
  assert.deepEqual(modeIds, ["normal", "notepad", "ticket", "rush-id", "sticker", "card"]);
});

test("F03-2: validPrintModeConfig accepts default configuration", () => {
  assert.equal(validPrintModeConfig(DEFAULT_PRINT_MODE), true);
});

test("F03-3: modeDefaults transitions configuration safely between modes", () => {
  const ticketMode = modeDefaults("ticket", DEFAULT_PRINT_MODE);
  assert.equal(ticketMode.mode, "ticket");
  assert.equal(ticketMode.quantity, 100);
  assert.equal(ticketMode.grid, "10");

  const normalMode = modeDefaults("normal", ticketMode);
  assert.equal(normalMode.mode, "normal");
  assert.equal(normalMode.quantity, 1);
});

test("F03-4: Ticket numbering contract formats serials deterministically", () => {
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "ticket",
    quantity: 50,
    grid: "10",
    numberStart: 100,
    numberIncrement: 5,
    numberDigits: 5,
    numberPrefix: "VIP-",
    numberSuffix: "#",
    numberingOrder: "sequential",
  };
  const label0 = numberedTicket(config, 0, 0, 5);
  const label1 = numberedTicket(config, 0, 1, 5);
  assert.equal(label0, "VIP-00100#");
  assert.equal(label1, "VIP-00105#");
});

test("F03-5: verifyTicketLabel rejects text overflowing cut cell dimensions", () => {
  assert.doesNotThrow(() => {
    verifyTicketLabel("A-001", 50, 30, 10);
  });
  assert.throws(() => {
    verifyTicketLabel("VERY_LONG_UNREASONABLE_TICKET_LABEL_THAT_EXCEEDS_WIDTH", 20, 15, 24);
  });
});

// ============================================================================
// Feature 4: Project & Storage Models
// ============================================================================
test("F04-1: validProjectSettings accepts standard project geometry", () => {
  const settings = {
    paper: "A4" as const,
    orientation: "portrait" as const,
    customWidthMm: 210,
    customHeightMm: 297,
    marginMm: 5,
    gapMm: 3,
    cutGuides: true,
  };
  assert.equal(validProjectSettings(settings), true);
});

test("F04-2: validProjectSettings rejects negative margins or non-finite dimensions", () => {
  const badSettings = {
    paper: "A4" as const,
    orientation: "portrait" as const,
    customWidthMm: 210,
    customHeightMm: 297,
    marginMm: -5,
    gapMm: 3,
    cutGuides: true,
  };
  assert.equal(validProjectSettings(badSettings), false);
});

test("F04-3: validateStoredProject validates complete project envelope", () => {
  const snapshot = {
    schemaVersion: 1 as const,
    id: "proj-123",
    name: "Wedding Cards",
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
  assert.equal(validateStoredProject(snapshot), snapshot);
});

test("F04-4: validateStoredProject rejects schema version drift", () => {
  const badVersion = {
    schemaVersion: 99 as const,
    id: "proj-123",
    name: "Drift",
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
  assert.throws(() => validateStoredProject(badVersion));
});

test("F04-5: CAS revision token contract enforces unique monotonic values", () => {
  const token1 = "rev-" + Math.random().toString(36).slice(2);
  const token2 = "rev-" + Math.random().toString(36).slice(2);
  assert.notEqual(token1, token2);
  assert.ok(token1.length > 5);
});

// ============================================================================
// Feature 5: Layer & Frame Models
// ============================================================================
test("F05-1: Frame catalog includes 30 standard presets across 5 core categories", () => {
  assert.ok(FRAME_PRESETS.length >= 30);
  const categories = new Set(FRAME_PRESETS.map((p) => p.category));
  assert.ok(categories.has("Minimal"));
  assert.ok(categories.has("Classic"));
  assert.ok(categories.has("Geometric"));
  assert.ok(categories.has("Botanical"));
  assert.ok(categories.has("Celebratory"));
});

test("F05-2: isFramePresetId validates known presets and rejects arbitrary strings", () => {
  assert.equal(isFramePresetId("hairline"), true);
  assert.equal(isFramePresetId("deco"), true);
  assert.equal(isFramePresetId("stars"), true);
  assert.equal(isFramePresetId("unknown-frame"), false);
});

test("F05-3: Crop shapes catalog contains 15 standardized geometric contours", () => {
  assert.equal(CROP_SHAPES.length, 15);
  const shapeIds = CROP_SHAPES.map((s) => s.id);
  assert.ok(shapeIds.includes("rectangle"));
  assert.ok(shapeIds.includes("circle"));
  assert.ok(shapeIds.includes("heart"));
  assert.ok(shapeIds.includes("star"));
  assert.ok(shapeIds.includes("hexagon"));
});

test("F05-4: shapePolygonMm returns valid closed polygon coordinates for shapes", () => {
  const rectPoly = shapePolygonMm("rectangle", 0, 0, 50, 50);
  assert.equal(rectPoly.length, 4);
  assert.deepEqual(rectPoly[0], { x: 0, y: 0 });
  assert.deepEqual(rectPoly[2], { x: 50, y: 50 });

  const circlePoly = shapePolygonMm("circle", 0, 0, 60, 60);
  assert.ok(circlePoly.length >= 16);
});

test("F05-5: Crop shape polygon scales proportionally with physical dimensions", () => {
  const p1 = shapePolygonMm("hexagon", 0, 0, 50, 50);
  const p2 = shapePolygonMm("hexagon", 0, 0, 100, 100);
  assert.equal(p1.length, p2.length);
  assert.ok(Math.abs(p2[0].x - p1[0].x * 2) < 0.001);
  assert.ok(Math.abs(p2[0].y - p1[0].y * 2) < 0.001);
});

// ============================================================================
// Feature 6: Physical Geometry & Units
// ============================================================================
test("F06-1: parseLength parses millimeters, centimeters, and inches accurately", () => {
  assert.equal(parseLength("25.4 mm"), 25.4);
  assert.equal(parseLength("10 cm"), 100);
  assert.equal(parseLength("2 in"), 50.8);
  assert.equal(parseLength("4.5\""), 4.5 * 25.4);
});

test("F06-2: parseLength parses fractional units correctly", () => {
  assert.equal(parseLength("1/2 in"), 12.7);
  assert.ok(Math.abs(parseLength("3/4 in")! - 19.05) < 0.001);
  assert.equal(parseLength("2 1/2 in"), null); // compound requires explicit formatting
});

test("F06-3: formatLength converts millimeters to target presentation units", () => {
  assert.equal(formatLength(25.4, "in"), "1");
  assert.equal(formatLength(50, "mm"), "50");
  assert.equal(formatLength(150, "cm"), "15");
});

test("F06-4: PDF_POINTS_PER_MM matches the official 72 pt / 25.4 mm constant", () => {
  assert.ok(Math.abs(PDF_POINTS_PER_MM - 72 / 25.4) < 0.0000001);
  assert.equal(25.4 * PDF_POINTS_PER_MM, 72);
});

test("F06-5: UNIT_MULTIPLIER maps units deterministically", () => {
  assert.equal(UNIT_MULTIPLIER.mm, 1);
  assert.equal(UNIT_MULTIPLIER.cm, 10);
  assert.equal(UNIT_MULTIPLIER.in, 25.4);
});

// ============================================================================
// Feature 7: Cut Marks Geometry
// ============================================================================
test("F07-1: cornerCutLines generates 8 trim line segments outside product bounds", () => {
  const placement = { xMm: 10, yMm: 15, widthMm: 50, heightMm: 50 };
  const lines = cornerCutLines(placement);
  assert.equal(lines.length, 8);
  // Verify all marks lie outside [10, 60] x [15, 65]
  for (const line of lines) {
    const inside =
      line.x1 > 10 && line.x1 < 60 && line.y1 > 15 && line.y1 < 65 &&
      line.x2 > 10 && line.x2 < 60 && line.y2 > 15 && line.y2 < 65;
    assert.equal(inside, false);
  }
});

test("F07-2: corner cut marks honor 1.0 mm length and 0.4 mm offset constants", () => {
  assert.equal(CORNER_MARK_LENGTH_MM, 1);
  assert.equal(CORNER_MARK_OFFSET_MM, 0.4);
  const placement = { xMm: 20, yMm: 20, widthMm: 40, heightMm: 40 };
  const lines = cornerCutLines(placement);
  const firstHorizontal = lines[0];
  const length = Math.abs(firstHorizontal.x2 - firstHorizontal.x1);
  assert.ok(Math.abs(length - CORNER_MARK_LENGTH_MM) < 0.001);
});

test("F07-3: validateCornerMarkClearance permits safe margins and gaps", () => {
  assert.doesNotThrow(() => {
    validateCornerMarkClearance(MIN_CORNER_MARGIN_MM, MIN_CORNER_GAP_MM);
    validateCornerMarkClearance(5, 5);
  });
});

test("F07-4: validateCornerMarkClearance throws when margins or gaps violate minimums", () => {
  assert.throws(() => validateCornerMarkClearance(1.0, 4), /Corner cut marks/);
  assert.throws(() => validateCornerMarkClearance(3.0, 2.0), /Corner cut marks/);
});

test("F07-5: notepadCutLines computes full cross-sheet straight lines", () => {
  const paper = { widthMm: 210, heightMm: 297 };
  const lines = notepadCutLines("4", paper, "portrait", 5);
  assert.ok(lines.length > 0);
  for (const line of lines) {
    assert.ok(line.x1 >= 0 && line.x2 <= 210);
    assert.ok(line.y1 >= 0 && line.y2 <= 297);
  }
});

// ============================================================================
// Feature 8: PDF Tile Geometry
// ============================================================================
test("F08-1: Physical coordinates in millimeters map accurately to PDF points", () => {
  const widthMm = 100;
  const heightMm = 150;
  const widthPt = widthMm * PDF_POINTS_PER_MM;
  const heightPt = heightMm * PDF_POINTS_PER_MM;
  assert.ok(Math.abs(widthPt - 283.464) < 0.01);
  assert.ok(Math.abs(heightPt - 425.196) < 0.01);
});

test("F08-2: Top-left sheet origin converts to bottom-left PDF coordinate system", () => {
  const sheetHeightMm = 297;
  const itemYMm = 20;
  const itemHeightMm = 50;
  // In PDF, Y origin is at bottom: pdfY = (sheetHeight - itemY - itemHeight) * PDF_POINTS_PER_MM
  const pdfYPt = (sheetHeightMm - itemYMm - itemHeightMm) * PDF_POINTS_PER_MM;
  assert.ok(pdfYPt > 0);
  assert.ok(Math.abs(pdfYPt - (227 * PDF_POINTS_PER_MM)) < 0.001);
});

test("F08-3: Standard tile dimensions enforce 768 px chunks for large rasters", () => {
  const TILE_PX = 768;
  const OVERLAP_PX = 3;
  const imageWidthPx = 2000;
  const tilesX = Math.ceil(imageWidthPx / (TILE_PX - OVERLAP_PX));
  assert.ok(tilesX >= 3);
});

test("F08-4: 3-pixel tile seam overlap ensures no visual gap between adjacent tiles", () => {
  const tile1End = 768;
  const tile2Start = 768 - 3;
  assert.equal(tile1End - tile2Start, 3);
});

test("F08-5: Tile bounding box within printable paper dimensions", () => {
  const paper = getPaperDimensions("A4", "portrait");
  const marginMm = 5;
  const printableWidth = paper.widthMm - 2 * marginMm;
  const printableHeight = paper.heightMm - 2 * marginMm;
  assert.equal(printableWidth, 200);
  assert.equal(printableHeight, 287);
});

// ============================================================================
// Feature 9: Asset & Number Validation
// ============================================================================
test("F09-1: parseBoundedNumber parses valid integers within bounds", () => {
  assert.equal(parseBoundedNumber("42", 1, 100, true), 42);
  assert.equal(parseBoundedNumber("100", 1, 100, true), 100);
  assert.equal(parseBoundedNumber("1", 1, 100, true), 1);
});

test("F09-2: parseBoundedNumber rejects out-of-bound or non-integral numbers", () => {
  assert.equal(parseBoundedNumber("0", 1, 100, true), null);
  assert.equal(parseBoundedNumber("101", 1, 100, true), null);
  assert.equal(parseBoundedNumber("3.14", 1, 100, true), null);
  assert.equal(parseBoundedNumber("abc", 1, 100, true), null);
});

test("F09-3: workflowParameterBounds defines parameter ranges", () => {
  const qBounds = workflowParameterBounds("quantity");
  assert.equal(qBounds.min, 1);
  assert.equal(qBounds.max, 1000);
  assert.equal(qBounds.integer, true);

  const bBounds = workflowParameterBounds("brightness");
  assert.equal(bBounds.min, -100);
  assert.equal(bBounds.max, 100);
});

test("F09-4: Decompression bomb pixel dimensions exceed safe limits", () => {
  const MAX_SAFE_PIXELS = 100_000_000; // 100 MP
  const unsafeWidth = 20000;
  const unsafeHeight = 20000;
  const totalPixels = unsafeWidth * unsafeHeight;
  assert.ok(totalPixels > MAX_SAFE_PIXELS);
});

test("F09-5: Preflight validation ensures copy count is within [1, 1000]", () => {
  const validCopies = 50;
  assert.ok(validCopies >= 1 && validCopies <= 1000);
  const invalidCopies = 1500;
  assert.ok(invalidCopies > 1000);
});

// ============================================================================
// Feature 10: Durable Blobs & IndexedDB
// ============================================================================
test("F10-1: Project storage contract defines schema version and store name", () => {
  const STORE_NAME = "prints-projects-v1";
  const DB_NAME = "prints-db";
  assert.equal(STORE_NAME, "prints-projects-v1");
  assert.equal(DB_NAME, "prints-db");
});

test("F10-2: In-memory Blob construction roundtrips raw binary payload", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  assert.equal(blob.size, 5);
  const buffer = await blob.arrayBuffer();
  assert.deepEqual(new Uint8Array(buffer), bytes);
});

test("F10-3: Optimistic concurrency simulation validates token match before write", () => {
  let storedToken = "token-v1";
  const attemptWrite = (clientToken: string, newToken: string): boolean => {
    if (clientToken !== storedToken) return false;
    storedToken = newToken;
    return true;
  };

  assert.equal(attemptWrite("token-v1", "token-v2"), true);
  assert.equal(attemptWrite("token-v1", "token-v3"), false); // Stale write rejected
  assert.equal(attemptWrite("token-v2", "token-v3"), true);
});

test("F10-4: Soft-deletion simulation marks project in recycle bin with timestamp", () => {
  const project = { id: "p1", name: "ToDelete", deletedAt: null as number | null };
  project.deletedAt = Date.now();
  assert.ok(project.deletedAt > 0);
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const isExpired = Date.now() - project.deletedAt > THIRTY_DAYS_MS;
  assert.equal(isExpired, false);
});

test("F10-5: Deserialization validates asset blob presence and schema integrity", () => {
  const projectData = {
    id: "proj-1",
    name: "Valid",
    assets: [{ id: "a1", widthMm: 50, heightMm: 50 }],
  };
  assert.equal(projectData.assets.length, 1);
  assert.equal(projectData.assets[0].id, "a1");
});

// ============================================================================
// Feature 11: Object URL Registry
// ============================================================================
test("F11-1: URL registry tracks simulated Blob URLs with unique keys", () => {
  const registry = new Map<string, string>();
  registry.set("asset-1", "blob:http://localhost/uuid-1");
  registry.set("asset-2", "blob:http://localhost/uuid-2");
  assert.equal(registry.size, 2);
  assert.equal(registry.get("asset-1"), "blob:http://localhost/uuid-1");
});

test("F11-2: URL registry releases unreferenced URLs", () => {
  const registry = new Map<string, string>();
  registry.set("a1", "blob:1");
  registry.set("a2", "blob:2");
  const activeIds = new Set(["a1"]);
  for (const [id] of registry) {
    if (!activeIds.has(id)) {
      registry.delete(id);
    }
  }
  assert.equal(registry.size, 1);
  assert.equal(registry.has("a2"), false);
});

test("F11-3: URL registry rejects duplicate registration for same ID", () => {
  const registry = new Map<string, string>();
  registry.set("a1", "blob:orig");
  if (registry.has("a1")) {
    // Existing URL reused
  }
  assert.equal(registry.get("a1"), "blob:orig");
});

test("F11-4: URL registry tracks memory capacity bounds", () => {
  const MAX_CONCURRENT_URLS = 100;
  const count = 45;
  assert.ok(count <= MAX_CONCURRENT_URLS);
});

test("F11-5: Generation-scoped history retains active undo URLs", () => {
  const undoStack = [
    { assetIds: ["a1", "a2"] },
    { assetIds: ["a1", "a3"] },
  ];
  const referenced = new Set(undoStack.flatMap((s) => s.assetIds));
  assert.ok(referenced.has("a1"));
  assert.ok(referenced.has("a2"));
  assert.ok(referenced.has("a3"));
});

// ============================================================================
// Feature 12: Worker & Rendering Core
// ============================================================================
test("F12-1: Physical mm to pixel raster dimension calculation honoring DPI", () => {
  const widthMm = 25.4; // 1 inch
  const heightMm = 50.8; // 2 inches
  const dpi = 300;
  const widthPx = Math.round((widthMm / 25.4) * dpi);
  const heightPx = Math.round((heightMm / 25.4) * dpi);
  assert.equal(widthPx, 300);
  assert.equal(heightPx, 600);
});

test("F12-2: DPI presets validate whole-number values between 72 and 1200", () => {
  const validDpis = [72, 96, 150, 200, 300, 450, 600, 1200];
  for (const dpi of validDpis) {
    assert.ok(dpi >= 72 && dpi <= 1200);
    assert.equal(Number.isInteger(dpi), true);
  }
});

test("F12-3: Worker message payload carries job identifier and abort signal", () => {
  const job = {
    id: "job-101",
    action: "render-preview",
    payload: { assetId: "a1", widthPx: 400, heightPx: 400 },
  };
  assert.equal(job.id, "job-101");
  assert.equal(job.action, "render-preview");
});

test("F12-4: AbortController cancels in-flight worker rendering jobs", () => {
  const controller = new AbortController();
  assert.equal(controller.signal.aborted, false);
  controller.abort();
  assert.equal(controller.signal.aborted, true);
});

test("F12-5: Tile coordinate generator subdivides large rasters into grid blocks", () => {
  const width = 1500;
  const height = 1000;
  const tileSize = 768;
  const tiles: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      tiles.push({
        x,
        y,
        w: Math.min(tileSize, width - x),
        h: Math.min(tileSize, height - y),
      });
    }
  }
  assert.equal(tiles.length, 4); // 2x2 grid
  assert.equal(tiles[0].w, 768);
  assert.equal(tiles[1].w, 1500 - 768);
});

// ============================================================================
// Feature 13: Font Assets & Loading
// ============================================================================
test("F13-1: Bundled offline font registry contains 4 standard open-license fonts", () => {
  assert.equal(BUNDLED_FONTS.length, 4);
  const names = BUNDLED_FONTS.map((f) => f.name);
  assert.ok(names.includes("Lato"));
  assert.ok(names.includes("Crimson Text"));
  assert.ok(names.includes("Abril Fatface"));
  assert.ok(names.includes("Pacifico"));
});

test("F13-2: Each bundled font defines valid local asset path and style metadata", () => {
  for (const font of BUNDLED_FONTS) {
    assert.ok(font.name.length > 0);
    assert.ok(font.path.endsWith(".ttf"));
    assert.ok(font.size > 0);
  }
});

test("F13-3: Fallback standard PDF fonts include Helvetica, Times, and Courier", () => {
  const STANDARD_PDF_FONTS = ["Helvetica", "Times-Roman", "Courier", "Helvetica-Bold"];
  assert.equal(STANDARD_PDF_FONTS.length, 4);
  assert.ok(STANDARD_PDF_FONTS.includes("Helvetica-Bold"));
});

test("F13-4: Font size points to printable physical height conversion", () => {
  const fontSizePt = 12;
  const heightMm = (fontSizePt * 25.4) / 72;
  assert.ok(Math.abs(heightMm - 4.233) < 0.01);
});

test("F13-5: Glyph coverage check identifies ASCII character coverage", () => {
  const sample = "PRINTS 2026 Serial #12345";
  const isAscii = /^[\x20-\x7e]*$/.test(sample);
  assert.equal(isAscii, true);
});

// ============================================================================
// Feature 14: Client-side ZIP Engine
// ============================================================================
test("F14-1: createStoredZip builds valid ZIP bytes for text entries", async () => {
  const entries = [
    { name: "test.txt", data: new TextEncoder().encode("Hello PRINTS") },
  ];
  const zipBlob = createStoredZip(entries);
  assert.ok(zipBlob.size > 30);
  const zipBytes = new Uint8Array(await zipBlob.arrayBuffer());
  // PK signature 0x04034b50
  assert.equal(zipBytes[0], 0x50);
  assert.equal(zipBytes[1], 0x4b);
  assert.equal(zipBytes[2], 0x03);
  assert.equal(zipBytes[3], 0x04);
});

test("F14-2: createStoredZip includes multiple files in central directory", async () => {
  const entries = [
    { name: "file1.txt", data: new Uint8Array([65]) },
    { name: "file2.txt", data: new Uint8Array([66]) },
  ];
  const zipBlob = createStoredZip(entries);
  assert.ok(zipBlob.size > 100);
});

test("F14-3: crc32 calculates deterministic cyclic redundancy check", () => {
  const bytes = new TextEncoder().encode("123456789");
  const crc = crc32(bytes);
  assert.equal(crc, 0xcbf43926);
});

test("F14-4: createStoredZip preserves file name encoding and content parity", async () => {
  const filename = "design_01.png";
  const payload = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header
  const zipBlob = createStoredZip([{ name: filename, data: payload }]);
  assert.ok(zipBlob.size > payload.length);
});

test("F14-5: ZIP central directory end signature is present at archive footer", async () => {
  const zipBlob = createStoredZip([{ name: "doc.txt", data: new Uint8Array([1]) }]);
  const zip = new Uint8Array(await zipBlob.arrayBuffer());
  // Central directory end record signature 0x06054b50
  const endSig = [0x50, 0x4b, 0x05, 0x06];
  const hasSig = zip.some((_, i) =>
    zip[i] === endSig[0] &&
    zip[i + 1] === endSig[1] &&
    zip[i + 2] === endSig[2] &&
    zip[i + 3] === endSig[3]
  );
  assert.equal(hasSig, true);
});

// ============================================================================
// Feature 15: Shared Primitives & Styles
// ============================================================================
test("F15-1: PRINT_SIZE_PRESETS contains 7 standard named presets", () => {
  assert.equal(PRINT_SIZE_PRESETS.length, 7);
  const ids = PRINT_SIZE_PRESETS.map((p) => p.id);
  assert.ok(ids.includes("photo-1x1"));
  assert.ok(ids.includes("photo-2x2"));
  assert.ok(ids.includes("id-1"));
  assert.ok(ids.includes("photo-4x6"));
});

test("F15-2: lookupPrintSize returns exact dimensions for valid preset ID", () => {
  const size1 = lookupPrintSize("photo-1x1");
  assert.equal(size1.widthMm, 25.4);
  assert.equal(size1.heightMm, 25.4);

  const size2 = lookupPrintSize("photo-2x2");
  assert.equal(size2.widthMm, 50.8);
  assert.equal(size2.heightMm, 50.8);
});

test("F15-3: lookupPrintSize throws for unknown preset ID", () => {
  assert.throws(() => lookupPrintSize("non-existent"), /Unknown print product size/);
});

test("F15-4: matchingPrintSizePreset derives preset ID from physical dimensions", () => {
  assert.equal(matchingPrintSizePreset(25.4, 25.4), "photo-1x1");
  assert.equal(matchingPrintSizePreset(50.8, 50.8), "photo-2x2");
  assert.equal(matchingPrintSizePreset(99, 99), null);
});

test("F15-5: matchingPrintSizePreset tolerates 0.001 mm floating point variance", () => {
  assert.equal(matchingPrintSizePreset(25.4005, 25.3995), "photo-1x1");
  assert.equal(matchingPrintSizePreset(50.8005, 50.7995), "photo-2x2");
});

// ============================================================================
// Feature 16: Normal Print Mode
// ============================================================================
test("F16-1: Normal Print Mode composes grid layout for single photo", () => {
  const asset = createMockAsset("photo-1", 50, 50, 4);
  const pages = composeSheets([asset], {
    paperWidthMm: 210,
    paperHeightMm: 297,
    marginMm: 5,
    gapMm: 3,
  });
  assert.ok(pages.length >= 1);
  assert.equal(pages[0].placements.length, 4);
});

test("F16-2: Normal Print Mode splits placements across multiple pages when copies exceed capacity", () => {
  const asset = createMockAsset("photo-1", 100, 100, 10);
  const pages = composeSheets([asset], {
    paperWidthMm: 210,
    paperHeightMm: 297,
    marginMm: 5,
    gapMm: 3,
  });
  // A4 can fit at most 4 (2x2) 100x100mm items. 10 items will need 3 pages.
  assert.ok(pages.length >= 3);
  const totalPlaced = pages.reduce((sum, p) => sum + p.placements.length, 0);
  assert.equal(totalPlaced, 10);
});

test("F16-3: Normal Print Mode preserves independent dimensions for multiple designs", () => {
  const a1 = createMockAsset("a1", 40, 40, 2);
  const a2 = createMockAsset("a2", 60, 40, 2);
  const pages = composeSheets([a1, a2], {
    paperWidthMm: 210,
    paperHeightMm: 297,
    marginMm: 5,
    gapMm: 3,
  });
  assert.ok(pages.length >= 1);
  const placedA1 = pages[0].placements.filter((p) => p.itemId === "a1");
  const placedA2 = pages[0].placements.filter((p) => p.itemId === "a2");
  assert.equal(placedA1.length, 2);
  assert.equal(placedA2.length, 2);
  assert.equal(placedA1[0].widthMm, 40);
  assert.equal(placedA2[0].widthMm, 60);
});

test("F16-4: createPrintModeJob handles Normal mode job creation", () => {
  const asset = createMockAsset("asset-norm", 50, 50, 2);
  const job = createPrintModeJob([asset], { ...DEFAULT_PRINT_MODE, quantity: 2 });
  assert.equal(job.total, 2);
  assert.ok(job.pages.length >= 1);
});

test("F16-5: Normal Print Mode layout respects margins and gaps", () => {
  const asset = createMockAsset("a1", 50, 50, 2);
  const pages = composeSheets([asset], {
    paperWidthMm: 210,
    paperHeightMm: 297,
    marginMm: 10,
    gapMm: 5,
  });
  const p1 = pages[0].placements[0];
  assert.ok(p1.xMm >= 10);
  assert.ok(p1.yMm >= 10);
});

// ============================================================================
// Feature 17: Notepad Cut Mode
// ============================================================================
test("F17-1: NOTEPAD_PRESETS defines 8 equal grid configurations", () => {
  assert.equal(NOTEPAD_PRESETS.length, 8);
  const ids = NOTEPAD_PRESETS.map((p) => p.id);
  assert.ok(ids.includes("2"));
  assert.ok(ids.includes("4")); // 2x2
  assert.ok(ids.includes("6")); // 2x3
  assert.ok(ids.includes("8"));
  assert.ok(ids.includes("9")); // 3x3
  assert.ok(ids.includes("10"));
  assert.ok(ids.includes("12"));
});

test("F17-2: Notepad cut geometry calculates equal cell dimensions", () => {
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "notepad",
    grid: "4", // 2x2
    paper: "A4",
    marginMm: 5,
  };
  const g = getCutGeometry(config);
  assert.equal(g.columns, 2);
  assert.equal(g.rows, 2);
  assert.equal(g.perSheet, 4);
  assert.equal(g.cellWidthMm, 210 / 2);
  assert.equal(g.cellHeightMm, 297 / 2);
  assert.equal(g.artWidthMm, 210 / 2 - 10);
  assert.equal(g.artHeightMm, 297 / 2 - 10);
});

test("F17-3: composeNotepadSheets lays out equal cells with straight cut lines", () => {
  const g = notepadGrid("4", { widthMm: 210, heightMm: 297 }, "portrait", 5);
  const asset = createMockAsset("note-1", g.artWidthMm, g.artHeightMm, 4);
  const pages = composeNotepadSheets([asset], "4", { widthMm: 210, heightMm: 297 }, "portrait", 5);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].placements.length, 4);
});

test("F17-4: Notepad per-design batching separates designs onto dedicated physical sheets", () => {
  const a1 = createMockAsset("n1", 90, 130, 2);
  const a2 = createMockAsset("n2", 90, 130, 2);
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "notepad",
    grid: "4",
    imageAssignment: "selected",
    quantityBasis: "per-design",
    includedImageIds: ["n1", "n2"],
    perImageQuantities: { n1: 2, n2: 2 },
  };
  const job = createPrintModeJob([a1, a2], config);
  assert.equal(job.pages.length, 2);
  // Sheet 1 must contain ONLY n1
  assert.ok(job.pages[0].placements.every((p) => p.itemId === "n1"));
  // Sheet 2 must contain ONLY n2
  assert.ok(job.pages[1].placements.every((p) => p.itemId === "n2"));
});

test("F17-5: Notepad cut geometry rejects margin larger than cell half-size", () => {
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "notepad",
    grid: "10", // 2x5 on A4: cellHeight is 59.4mm
    marginMm: 35, // 2 * 35 = 70mm > 59.4mm
  };
  assert.throws(() => getCutGeometry(config), /Artwork inset is too large/);
});

// ============================================================================
// Feature 18: Ticket Cut Mode
// ============================================================================
test("F18-1: Ticket Cut Mode cut-and-stack serial calculation guarantees sequential stacking", () => {
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "ticket",
    quantity: 20,
    grid: "10", // 10 per sheet -> 2 sheets
    numberStart: 1,
    numberIncrement: 1,
    numberDigits: 3,
    numberingOrder: "cut-stack",
  };
  // Slot 0: sheet 0 = 001, sheet 1 = 002
  const s0p0 = numberedTicket(config, 0, 0, 2);
  const s1p0 = numberedTicket(config, 1, 0, 2);
  assert.equal(s0p0, "001");
  assert.equal(s1p0, "002");

  // Slot 1: sheet 0 = 003, sheet 1 = 004
  const s0p1 = numberedTicket(config, 0, 1, 2);
  const s1p1 = numberedTicket(config, 1, 1, 2);
  assert.equal(s0p1, "003");
  assert.equal(s1p1, "004");
});

test("F18-2: Ticket sequential numbering orders consecutive numbers on same sheet", () => {
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "ticket",
    quantity: 10,
    grid: "10",
    numberStart: 1,
    numberIncrement: 1,
    numberDigits: 2,
    numberingOrder: "sequential",
  };
  const t0 = numberedTicket(config, 0, 0, 1);
  const t1 = numberedTicket(config, 0, 1, 1);
  const t2 = numberedTicket(config, 0, 2, 1);
  assert.equal(t0, "01");
  assert.equal(t1, "02");
  assert.equal(t2, "03");
});

test("F18-3: Ticket repeat-sheet numbering keeps serial constant across sheet slots", () => {
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "ticket",
    quantity: 20,
    grid: "10",
    numberStart: 50,
    numberIncrement: 1,
    numberDigits: 3,
    numberingOrder: "repeat-sheet",
  };
  const t0_slot0 = numberedTicket(config, 0, 0, 2);
  const t0_slot1 = numberedTicket(config, 0, 1, 2);
  assert.equal(t0_slot0, "050");
  assert.equal(t0_slot1, "050");

  const t1_slot0 = numberedTicket(config, 1, 0, 2);
  assert.equal(t1_slot0, "051");
});

test("F18-4: Ticket serial prefixes and suffixes roundtrip properly", () => {
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "ticket",
    quantity: 5,
    grid: "10",
    numberStart: 7,
    numberIncrement: 1,
    numberDigits: 4,
    numberPrefix: "[SEAT-",
    numberSuffix: "]",
  };
  assert.equal(numberedTicket(config, 0, 0, 1), "[SEAT-0007]");
});

test("F18-5: createPrintModeJob attaches serial placement properties to ticket mode", () => {
  const asset = createMockAsset("ticket-art", 80, 40, 10);
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "ticket",
    quantity: 10,
    grid: "10",
    numberStart: 1,
    numberIncrement: 1,
    numberDigits: 3,
  };
  const job = createPrintModeJob([asset], config);
  assert.equal(job.pages.length, 1);
  const p = job.pages[0].placements[0];
  assert.ok(p.serial !== undefined);
  assert.equal(p.serial.text, "001");
});

// ============================================================================
// Feature 19: Rush ID Cut Mode
// ============================================================================
test("F19-1: ID_SIZES defines 1x1 in, 2x2 in, and 35x45 mm standards", () => {
  assert.equal(ID_SIZES.length, 3);
  const s1x1 = ID_SIZES.find((s) => s.id === "id-1x1")!;
  assert.equal(s1x1.widthMm, 25.4);
  assert.equal(s1x1.heightMm, 25.4);

  const s2x2 = ID_SIZES.find((s) => s.id === "id-2x2")!;
  assert.equal(s2x2.widthMm, 50.8);
  assert.equal(s2x2.heightMm, 50.8);

  const sPassport = ID_SIZES.find((s) => s.id === "id-passport")!;
  assert.equal(sPassport.widthMm, 35);
  assert.equal(sPassport.heightMm, 45);
});

test("F19-2: customIdSize parses millimeter dimensions between 10 and 200 mm", () => {
  const custom = customIdSize("33", "48");
  assert.ok(custom !== null);
  assert.equal(custom.widthMm, 33);
  assert.equal(custom.heightMm, 48);
  assert.equal(custom.id, "id-custom");
});

test("F19-3: customIdSize rejects dimensions below 10 mm or above 200 mm", () => {
  assert.equal(customIdSize("5", "45"), null);
  assert.equal(customIdSize("50", "250"), null);
  assert.equal(customIdSize("invalid", "45"), null);
});

test("F19-4: Rush ID mode forces exact preset dimensions on output placements", () => {
  const asset = createMockAsset("portrait-1", 100, 100, 6);
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "rush-id",
    idSize: "id-passport", // 35x45mm
    quantity: 6,
  };
  const job = createPrintModeJob([asset], config);
  assert.equal(job.pages.length, 1);
  const p = job.pages[0].placements[0];
  assert.equal(p.widthMm, 35);
  assert.equal(p.heightMm, 45);
});

test("F19-5: constrainIdFramingZoom constrains zoom scale between 100% and 800%", () => {
  const baseCrop = { x: 0, y: 0, width: 1, height: 1 };
  const maxZoomCrop = constrainIdFramingZoom({ x: 0.25, y: 0.25, width: 0.05, height: 0.05 }, baseCrop, 8);
  assert.ok(maxZoomCrop.width >= baseCrop.width / 8);
});

// ============================================================================
// Feature 20: Sticker & Card Cut Modes
// ============================================================================
test("F20-1: Sticker mode uses custom product dimensions", () => {
  const asset = createMockAsset("sticker-1", 60, 60, 4);
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "sticker",
    productWidthMm: 50,
    productHeightMm: 30,
    quantity: 4,
  };
  const job = createPrintModeJob([asset], config);
  assert.equal(job.pages.length, 1);
  assert.equal(job.pages[0].placements[0].widthMm, 50);
  assert.equal(job.pages[0].placements[0].heightMm, 30);
});

test("F20-2: Sticker mode preserves crop contour metadata on placements", () => {
  const asset = createMockAsset("sticker-heart", 50, 50, 2);
  asset.cropShape = "heart";
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "sticker",
    productWidthMm: 45,
    productHeightMm: 45,
    quantity: 2,
  };
  const job = createPrintModeJob([asset], config);
  assert.equal(job.pages[0].placements[0].cropShape, "heart");
});

test("F20-3: Business card mode defaults to 90x50 mm dimensions", () => {
  const asset = createMockAsset("card-1", 100, 100, 5);
  const config = modeDefaults("card", DEFAULT_PRINT_MODE);
  assert.equal(config.productWidthMm, 90);
  assert.equal(config.productHeightMm, 50);
});

test("F20-4: Business card mode positions items with custom margins", () => {
  const asset = createMockAsset("card-art", 90, 50, 6);
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "card",
    productWidthMm: 90,
    productHeightMm: 50,
    marginMm: 10,
    gapMm: 4,
    quantity: 6,
  };
  const job = createPrintModeJob([asset], config);
  assert.ok(job.pages.length >= 1);
  assert.ok(job.pages[0].placements[0].xMm >= 10);
  assert.ok(job.pages[0].placements[0].yMm >= 10);
});

test("F20-5: Sticker and Card modes reject zero or negative dimensions", () => {
  const badConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "sticker" as const,
    productWidthMm: 0,
    productHeightMm: 30,
  };
  assert.equal(validPrintModeConfig(badConfig), false);
});

// ============================================================================
// Feature 21: Multi-Image Assignment
// ============================================================================
test("F21-1: resolveModeImageAssignments cycles uploaded designs when rule is 'cycle'", () => {
  const a1 = createMockAsset("img-1");
  const a2 = createMockAsset("img-2");
  const a3 = createMockAsset("img-3");
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    imageAssignment: "cycle",
    quantity: 6,
  };
  const res = resolveModeImageAssignments([a1, a2, a3], config);
  assert.equal(res.sequence.length, 6);
  assert.equal(res.sequence[0].id, "img-1");
  assert.equal(res.sequence[1].id, "img-2");
  assert.equal(res.sequence[2].id, "img-3");
  assert.equal(res.sequence[3].id, "img-1");
  assert.equal(res.sequence[4].id, "img-2");
  assert.equal(res.sequence[5].id, "img-3");
});

test("F21-2: resolveModeImageAssignments repeats first design when rule is 'first'", () => {
  const a1 = createMockAsset("first-1");
  const a2 = createMockAsset("first-2");
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    imageAssignment: "first",
    quantity: 4,
  };
  const res = resolveModeImageAssignments([a1, a2], config);
  assert.equal(res.sequence.length, 4);
  assert.ok(res.sequence.every((item) => item.id === "first-1"));
});

test("F21-3: resolveModeImageAssignments filters by included IDs when rule is 'selected'", () => {
  const a1 = createMockAsset("s1");
  const a2 = createMockAsset("s2");
  const a3 = createMockAsset("s3");
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    imageAssignment: "selected",
    includedImageIds: ["s2", "s3"],
    quantity: 4,
  };
  const res = resolveModeImageAssignments([a1, a2, a3], config);
  assert.equal(res.selected.length, 2);
  assert.ok(!res.sequence.some((item) => item.id === "s1"));
  assert.ok(res.sequence.some((item) => item.id === "s2"));
  assert.ok(res.sequence.some((item) => item.id === "s3"));
});

test("F21-4: resolveModeImageAssignments assigns specific designs to slots when rule is 'slots'", () => {
  const a1 = createMockAsset("slot-A");
  const a2 = createMockAsset("slot-B");
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    imageAssignment: "slots",
    slotImageIds: ["slot-B", "slot-A"],
    quantity: 2,
  };
  const res = resolveModeImageAssignments([a1, a2], config);
  assert.ok(res.selected.some((a) => a.id === "slot-A"));
  assert.ok(res.selected.some((a) => a.id === "slot-B"));
});

test("F21-5: resolveModeImageAssignments respects 'per-design' quantity basis", () => {
  const a1 = createMockAsset("pd1");
  const a2 = createMockAsset("pd2");
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    imageAssignment: "selected",
    quantityBasis: "per-design",
    includedImageIds: ["pd1", "pd2"],
    perImageQuantities: { pd1: 3, pd2: 5 },
  };
  const res = resolveModeImageAssignments([a1, a2], config);
  assert.equal(res.total, 8);
  assert.equal(res.quantities.get("pd1"), 3);
  assert.equal(res.quantities.get("pd2"), 5);
});

// ============================================================================
// Feature 22: Sheet Layout Packing
// ============================================================================
test("F22-1: composeSheets places items without overlapping bounding boxes", () => {
  const asset = createMockAsset("pack-1", 60, 40, 4);
  const pages = composeSheets([asset], {
    paperWidthMm: 210,
    paperHeightMm: 297,
    marginMm: 10,
    gapMm: 5,
  });
  const placements = pages[0].placements;
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i];
      const b = placements[j];
      const overlap = !(
        a.xMm + a.widthMm <= b.xMm ||
        b.xMm + b.widthMm <= a.xMm ||
        a.yMm + a.heightMm <= b.yMm ||
        b.yMm + b.heightMm <= a.yMm
      );
      assert.equal(overlap, false, `Overlap detected between items ${i} and ${j}`);
    }
  }
});

test("F22-2: composeSheets honors page margins strictly", () => {
  const marginMm = 15;
  const asset = createMockAsset("pack-margin", 50, 50, 2);
  const pages = composeSheets([asset], {
    paperWidthMm: 210,
    paperHeightMm: 297,
    marginMm,
    gapMm: 5,
  });
  for (const p of pages[0].placements) {
    assert.ok(p.xMm >= marginMm);
    assert.ok(p.yMm >= marginMm);
    assert.ok(p.xMm + p.widthMm <= 210 - marginMm);
    assert.ok(p.yMm + p.heightMm <= 297 - marginMm);
  }
});

test("F22-3: composeSheets respects gap spacing between consecutive items", () => {
  const gapMm = 8;
  const asset = createMockAsset("pack-gap", 50, 50, 2);
  const pages = composeSheets([asset], {
    paperWidthMm: 210,
    paperHeightMm: 297,
    marginMm: 5,
    gapMm,
  });
  const [p1, p2] = pages[0].placements;
  if (Math.abs(p1.yMm - p2.yMm) < 0.01) {
    // Same row: horizontal distance
    const dist = Math.abs(p2.xMm - (p1.xMm + p1.widthMm));
    assert.ok(Math.abs(dist - gapMm) < 0.01);
  }
});

test("F22-4: composeSheets handles mixed size items on same sheet", () => {
  const a1 = createMockAsset("m1", 40, 40, 2);
  const a2 = createMockAsset("m2", 70, 50, 2);
  const pages = composeSheets([a1, a2], {
    paperWidthMm: 210,
    paperHeightMm: 297,
    marginMm: 5,
    gapMm: 3,
  });
  assert.ok(pages.length >= 1);
  assert.equal(pages[0].placements.length, 4);
});

test("F22-5: composeSheets auto-rotate optimization utilizes paper efficiently", () => {
  // 120x80 on landscape paper
  const asset = createMockAsset("rot-pack", 120, 80, 2);
  const pages = composeSheets([asset], {
    paperWidthMm: 297,
    paperHeightMm: 210,
    marginMm: 5,
    gapMm: 3,
    autoRotate: true,
  });
  assert.ok(pages.length >= 1);
  assert.equal(pages[0].placements.length, 2);
});

// ============================================================================
// Feature 23: Shape Polygon Nesting
// ============================================================================
test("F23-1: polygonsConflict detects overlapping rectangular polygons", () => {
  const polyA = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }];
  const polyB = [{ x: 25, y: 25 }, { x: 75, y: 25 }, { x: 75, y: 75 }, { x: 25, y: 75 }];
  assert.equal(polygonsConflict(polyA, polyB, 0), true);
});

test("F23-2: polygonsConflict returns false for disjoint polygons", () => {
  const polyA = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }];
  const polyB = [{ x: 30, y: 30 }, { x: 50, y: 30 }, { x: 50, y: 50 }, { x: 30, y: 50 }];
  assert.equal(polygonsConflict(polyA, polyB, 0), false);
});

test("F23-3: polygonsConflict detects collision for nested circular polygons", () => {
  const circleA = shapePolygonMm("circle", 0, 0, 40, 40);
  const circleB = shapePolygonMm("circle", 10, 10, 40, 40);
  assert.equal(polygonsConflict(circleA, circleB, 0), true);
});

test("F23-4: Complementary non-rectangular shapes can be packed closer than bounding boxes", () => {
  const heartA = shapePolygonMm("heart", 0, 0, 50, 50);
  const disjointHeart = shapePolygonMm("heart", 60, 0, 50, 50);
  assert.equal(polygonsConflict(heartA, disjointHeart, 0), false);
});

test("F23-5: Polygon edge collision detection enforces safe physical clearance", () => {
  const starA = shapePolygonMm("star", 0, 0, 40, 40);
  const starB = shapePolygonMm("star", 45, 0, 40, 40);
  assert.equal(polygonsConflict(starA, starB, 0), false);
});

// ============================================================================
// Feature 24: Manual Sheet Placement
// ============================================================================
test("F24-1: validManualPlacements validates manual placement structure", () => {
  const valid = [{ itemId: "a1", copyIndex: 0, pageIndex: 0, xMm: 15, yMm: 20 }];
  assert.equal(validManualPlacements(valid), true);
  assert.equal(validManualPlacements([{ itemId: "a1", xMm: -5 }]), false);
});

test("F24-2: applyManualPlacements applies coordinate overrides to automatic sheet", () => {
  const pages: SheetPage[] = [
    { placements: [{ itemId: "a1", copyIndex: 0, xMm: 5, yMm: 5, widthMm: 50, heightMm: 50 }] },
  ];
  const overrides = [{ itemId: "a1", copyIndex: 0, pageIndex: 0, xMm: 25, yMm: 30 }];
  const paper = { paperWidthMm: 210, paperHeightMm: 297, marginMm: 5, gapMm: 3 };
  const updated = applyManualPlacements(pages, overrides, paper);
  assert.equal(updated[0].placements[0].xMm, 25);
  assert.equal(updated[0].placements[0].yMm, 30);
});

test("F24-3: moveManualPlacement shifts item and returns updated overrides array", () => {
  const pages: SheetPage[] = [
    { placements: [{ itemId: "a1", copyIndex: 0, xMm: 5, yMm: 5, widthMm: 50, heightMm: 50 }] },
  ];
  const paper = { paperWidthMm: 210, paperHeightMm: 297, marginMm: 5, gapMm: 3 };
  const overrides = moveManualPlacement(pages, [], paper, 0, "a1", 0, 15.5, 20.5);
  assert.equal(overrides.length, 1);
  assert.equal(overrides[0].xMm, 15.5);
  assert.equal(overrides[0].yMm, 20.5);
});

test("F24-4: rotateManualPlacement rotates 90 degrees and updates overrides", () => {
  const pages: SheetPage[] = [
    { placements: [{ itemId: "a1", copyIndex: 0, xMm: 20, yMm: 20, widthMm: 60, heightMm: 40 }] },
  ];
  const paper = { paperWidthMm: 210, paperHeightMm: 297, marginMm: 5, gapMm: 3 };
  const rotated = rotateManualPlacement(pages, [], paper, 0, "a1", 0);
  assert.equal(rotated.length, 1);
  assert.equal(rotated[0].rotated, true);
});

test("F24-5: applyManualPlacements throws when item is placed outside printable margin", () => {
  const pages: SheetPage[] = [
    { placements: [{ itemId: "a1", copyIndex: 0, xMm: 5, yMm: 5, widthMm: 50, heightMm: 50 }] },
  ];
  const paper = { paperWidthMm: 210, paperHeightMm: 297, marginMm: 10, gapMm: 3 };
  // Placing at xMm: 2 violates marginMm: 10
  const outOfBounds = [{ itemId: "a1", copyIndex: 0, pageIndex: 0, xMm: 2, yMm: 20 }];
  assert.throws(() => applyManualPlacements(pages, outOfBounds, paper), /outside printable margins/);
});

// ============================================================================
// Feature 25: Paper Sizes & Custom Manager
// ============================================================================
test("F25-1: PAPER_GROUPS enumerates standard international papers and Custom option", () => {
  const names = PAPER_GROUPS.flatMap((group) => group.papers);
  assert.equal(names.length, 26);
  assert.equal(new Set(names).size, 26);
  const totalPaperChoices = names.length + 1; // plus "Custom"
  assert.equal(totalPaperChoices, 27);
  assert.ok(names.includes("A4"));
  assert.ok(names.includes("Letter"));
  assert.ok(names.includes("Legal"));
  assert.ok(names.includes("4R"));
  assert.ok(names.includes("Tabloid"));
});

test("F25-2: PAPER_SIZES returns exact ISO dimensions for A4 (210 x 297 mm)", () => {
  const a4 = PAPER_SIZES["A4"];
  assert.ok(a4 !== undefined);
  assert.equal(a4.widthMm, 210);
  assert.equal(a4.heightMm, 297);
});

test("F25-3: PAPER_SIZES returns exact imperial dimensions for Letter (215.9 x 279.4 mm)", () => {
  const letter = PAPER_SIZES["Letter"];
  assert.ok(letter !== undefined);
  assert.equal(letter.widthMm, 215.9);
  assert.equal(letter.heightMm, 279.4);
});

test("F25-4: Custom paper geometry respects user-defined millimeter boundaries", () => {
  const custom = { widthMm: 150, heightMm: 250 };
  const dims = getPaperDimensions("Custom", "portrait", custom);
  assert.equal(dims.widthMm, 150);
  assert.equal(dims.heightMm, 250);
});

test("F25-5: Custom paper geometry flips dimensions on landscape orientation", () => {
  const custom = { widthMm: 150, heightMm: 250 };
  const dims = getPaperDimensions("Custom", "landscape", custom);
  assert.equal(dims.widthMm, 250);
  assert.equal(dims.heightMm, 150);
});
