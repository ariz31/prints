import assert from "node:assert/strict";
import test from "node:test";

import {
  PAPER_SIZES,
  composeSheets,
  PDF_POINTS_PER_MM,
} from "../../src/core/layout.ts";
import type { PhotoAsset, SheetPage, Placement } from "../../src/core/layout.ts";
import {
  DEFAULT_PRINT_MODE,
  createPrintModeJob,
  getCutGeometry,
  numberedTicket,
} from "../../src/core/printModes.ts";
import type { PrintModeConfig } from "../../src/core/printModes.ts";
import { resolveModeImageAssignments } from "../../src/core/printModeAssignments.ts";
import {
  notepadGrid,
  composeNotepadSheets,
  notepadCutLines,
} from "../../src/core/notepadLayout.ts";
import {
  ID_SIZES,
  customIdSize,
  constrainIdFramingZoom,
  canEditIdFraming,
  frameIdFace,
} from "../../src/core/idPhoto.ts";
import type { FaceBounds } from "../../src/core/idPhoto.ts";
import {
  DEFAULT_ADJUSTMENTS,
  validPhotoAdjustments,
  normalizeAdjustments,
  photoFilterCss,
  photoOpacityFraction,
  isNeutralAdjustment,
} from "../../src/core/photoAdjustments.ts";
import type { PhotoAdjustments, LocalRetouch } from "../../src/core/photoAdjustments.ts";
import {
  removeConnectedBackground,
  paintAlphaBrush,
  featherAlphaMask,
} from "../../src/core/background.ts";
import {
  validDesignLayers,
  newLayer,
  parseHexColor,
  MAX_DESIGN_LAYERS,
} from "../../src/core/layers.ts";
import type { DesignLayer, TextLayer, FrameLayer } from "../../src/core/layers.ts";
import { FRAME_PRESETS, MIN_FRAME_WEIGHT, MAX_FRAME_WEIGHT } from "../../src/core/frames.ts";
import { BUNDLED_FONTS } from "../../src/core/bundledFonts.ts";
import { pngDensityChunk } from "../../src/core/pngStream.ts";
import { createStoredZip, crc32 } from "../../src/core/zip.ts";
import { shapePolygonMm } from "../../src/core/cropShapes.ts";
import { polygonsConflict } from "../../src/core/shapeNesting.ts";
import { assertSafeSourceSize } from "../../src/core/assetIntegrity.ts";
import {
  newestRecoveryFirst,
  obsoleteRecoveryIds,
} from "../../src/core/draftRecovery.ts";
import type { RecoveryRecord } from "../../src/core/draftRecovery.ts";
import {
  validSessionPeerMessage,
  shouldForkSession,
} from "../../src/core/tabSessionCollision.ts";
import type { SessionPeerMessage } from "../../src/core/tabSessionCollision.ts";
import {
  readAppRoute,
  appRouteUrl,
  sameRoute,
  recordAppNavigation,
} from "../../src/core/appNavigation.ts";
import type { AppRoute, NavigationHistory } from "../../src/core/appNavigation.ts";

function createMockAsset(id: string, widthMm: number, heightMm: number, count = 1): PhotoAsset {
  return {
    id,
    file: new File([], `${id}.png`, { type: "image/png" }),
    previewUrl: `blob:mock/${id}`,
    widthMm,
    heightMm,
    pixelWidth: 1200,
    pixelHeight: 1800,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    count,
    quantity: count,
  };
}

// ============================================================================
// Tier 4: Real-World Production Application Scenarios (30 Tests)
// ============================================================================

// --- Scenario 01: Wedding Photobooth 4R Batch ---
test("S01: Wedding photobooth 4R/4x6 print strip batch with 2 mm margins", () => {
  const paper = PAPER_SIZES["4R"]; // 101.6 x 152.4 mm
  assert.equal(paper.widthMm, 101.6);
  assert.equal(paper.heightMm, 152.4);
  const photo = createMockAsset("booth-strip-1", 45, 140, 2);
  const sheets = composeSheets([photo], {
    paperWidthMm: paper.widthMm,
    paperHeightMm: paper.heightMm,
    marginMm: 2,
    gapMm: 2,
  });
  assert.ok(sheets.length >= 1);
  assert.equal(sheets[0].placements.length, 2); // 2 strips per 4R sheet
});

// --- Scenario 02: Official Passport Renewal Package ---
test("S02: Official passport renewal package with 35x45 mm headshots and solid white background", () => {
  const passportSpec = ID_SIZES.find((s) => s.id === "id-passport")!;
  assert.equal(passportSpec.widthMm, 35);
  assert.equal(passportSpec.heightMm, 45);
  const face: FaceBounds = { x: 400, y: 300, width: 400, height: 500 };
  const crop = frameIdFace(face, 1200, 1800, passportSpec.widthMm, passportSpec.heightMm, 0.13);
  assert.ok(crop.y >= 0 && crop.height <= 1);
  const adj: PhotoAdjustments = { ...DEFAULT_ADJUSTMENTS, backgroundColor: "#ffffff" };
  assert.equal(validPhotoAdjustments(adj), true);
  const asset = createMockAsset("passport-headshot", passportSpec.widthMm, passportSpec.heightMm, 8);
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "rush-id",
    quantity: 8,
    marginMm: 5,
  };
  const job = createPrintModeJob([asset], config);
  assert.equal(job.total, 8);
  assert.ok(job.pages.length >= 1);
});

// --- Scenario 03: High-School Festival Raffle Tickets ---
test("S03: High-school festival numbered raffle ticket sheet with custom prefix and font", () => {
  const ticketAsset = createMockAsset("raffle-bg", 70, 30, 1);
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "ticket",
    quantity: 20,
    numberStart: 5001,
    numberIncrement: 1,
    numberDigits: 5,
    numberPrefix: "FEST26-",
    numberingOrder: "sequential",
  };
  const job = createPrintModeJob([ticketAsset], config);
  assert.equal(job.total, 20);
  assert.equal(job.pages[0].placements[0].serial?.text, "FEST26-05001");
  assert.equal(job.pages[0].placements[9].serial?.text, "FEST26-05010");
  assert.equal(job.pages[1].placements[0].serial?.text, "FEST26-05011");
});

// --- Scenario 04: Artisan Honey Jar Round Stickers ---
test("S04: Artisan honey jar round sticker sheet with scalloped shape nesting", () => {
  const poly1 = shapePolygonMm("scallop", 10, 10, 50, 50);
  const poly2 = shapePolygonMm("scallop", 65, 10, 50, 50);
  const conflict = polygonsConflict(poly1, poly2, 1.5);
  assert.equal(conflict, false); // packed side-by-side with 5mm gap
  const frame: FrameLayer = {
    id: "f-botanical",
    name: "Botanical",
    kind: "frame",
    visible: true,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    color: "#8b5a2b",
    frameId: "leaf-tips",
    weight: 0.8,
  };
  assert.equal(validDesignLayers([frame]), true);
});

// --- Scenario 05: Independent Cafe Branded Loyalty Cards ---
test("S05: Independent cafe branded loyalty punch cards on CR80 business card stock", () => {
  const cardW = 85.6;
  const cardH = 53.98;
  const cardAsset = createMockAsset("loyalty-card", cardW, cardH, 10);
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "card",
    quantity: 10,
    productWidthMm: cardW,
    productHeightMm: cardH,
    marginMm: 5,
  };
  const job = createPrintModeJob([cardAsset], config);
  assert.equal(job.total, 10);
  assert.ok(job.pages.length >= 1);
});

// --- Scenario 06: Restaurant Daily Kitchen Memo Notepad ---
test("S06: Daily restaurant kitchen memo notepad with 6-up grid and 5 mm inset", () => {
  const paper = { widthMm: 210, heightMm: 297 };
  const grid = notepadGrid("6", paper, "portrait", 5);
  const memoAsset = createMockAsset("kitchen-memo", grid.artWidthMm, grid.artHeightMm, 18);
  const sheets = composeNotepadSheets([memoAsset], "6", paper, "portrait", 5);
  assert.equal(sheets.length, 3); // 18 copies across 6-up grid = 3 physical sheets
  const cuts = notepadCutLines("6", paper, "portrait", 5);
  assert.ok(cuts.length > 0);
});

// --- Scenario 07: Real Estate Open House Photo Collage ---
test("S07: Real estate open house photo collage using 4-slot image layout", () => {
  const assets = [
    createMockAsset("facade", 100, 70),
    createMockAsset("kitchen", 100, 70),
    createMockAsset("master-bed", 100, 70),
    createMockAsset("backyard", 100, 70),
  ];
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "normal",
    imageAssignment: "slots",
    slotImageIds: ["facade", "kitchen", "master-bed", "backyard"],
  };
  const assignment = resolveModeImageAssignments(assets, config);
  assert.equal(assignment.selected.length, 4);
  assert.equal(assignment.selected[0].id, "facade");
  assert.equal(assignment.selected[3].id, "backyard");
});

// --- Scenario 08: Vintage Portrait Studio Session ---
test("S08: Vintage portrait studio session with sepia adjustments and filigree frame", () => {
  const adj: PhotoAdjustments = {
    ...DEFAULT_ADJUSTMENTS,
    contrast: 15,
    saturation: -40,
    temperature: 30, // warm sepia tone
    vignette: 45,
  };
  assert.equal(validPhotoAdjustments(adj), true);
  const frame: FrameLayer = {
    id: "f-filigree",
    name: "Filigree",
    kind: "frame",
    visible: true,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    color: "#5c4033",
    frameId: "filigree",
    weight: 1.2,
  };
  assert.equal(validDesignLayers([frame]), true);
});

// --- Scenario 09: Conference Attendee Badge Batch ---
test("S09: Conference attendee badge batch with name text layer and QR placement", () => {
  const font = BUNDLED_FONTS[0];
  const nameLayer: TextLayer = {
    id: "attendee-name",
    name: "Attendee Name",
    kind: "text",
    visible: true,
    x: 0.1,
    y: 0.35,
    width: 0.8,
    height: 0.18,
    color: "#0a192f",
    text: "Dr. Jane Doe",
    fontSizePt: 20,
    bundledFontId: font.id,
    align: "center",
  };
  const orgLayer: TextLayer = {
    id: "attendee-org",
    name: "Organization",
    kind: "text",
    visible: true,
    x: 0.1,
    y: 0.55,
    width: 0.8,
    height: 0.12,
    color: "#4a5568",
    text: "Global Science Institute",
    fontSizePt: 12,
    bundledFontId: font.id,
    align: "center",
  };
  assert.equal(validDesignLayers([nameLayer, orgLayer]), true);
});

// --- Scenario 10: Fine Art Photography Giclée on Custom Paper ---
test("S10: Fine art photography giclée print on custom oversized 400x500 mm paper", () => {
  const customPaper = { name: "FineArtCotton", widthMm: 400, heightMm: 500 };
  const artAsset = createMockAsset("landscape-giclee", 360, 460, 1);
  const sheets = composeSheets([artAsset], {
    paperWidthMm: customPaper.widthMm,
    paperHeightMm: customPaper.heightMm,
    marginMm: 20,
    gapMm: 0,
  });
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].placements.length, 1);
  assert.equal(sheets[0].placements[0].xMm, 20);
  assert.equal(sheets[0].placements[0].yMm, 20);
});

// --- Scenario 11: School Yearbook Portrait Batch ---
test("S11: School yearbook portrait batch with auto-rotated 50x70 mm oval crops", () => {
  const polyOval = shapePolygonMm("oval", 0, 0, 50, 70);
  assert.ok(polyOval.length >= 10);
  const students = Array.from({ length: 6 }, (_, i) =>
    createMockAsset(`student-${i + 1}`, 50, 70, 1)
  );
  const sheets = composeSheets(students, {
    paperWidthMm: 210,
    paperHeightMm: 297,
    marginMm: 10,
    gapMm: 5,
  });
  assert.ok(sheets.length >= 1);
  assert.equal(sheets[0].placements.length, 6);
});

// --- Scenario 12: Holiday Greeting Postcard Run ---
test("S12: Holiday greeting postcard run with celebratory stars vector frame", () => {
  const frame: FrameLayer = {
    id: "holiday-stars",
    name: "Stars",
    kind: "frame",
    visible: true,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    color: "#b22222", // holiday red
    frameId: "stars",
    weight: 1.5,
  };
  assert.equal(validDesignLayers([frame]), true);
  const greetingText: TextLayer = {
    id: "txt-greeting",
    name: "Greeting",
    kind: "text",
    visible: true,
    x: 0.1,
    y: 0.8,
    width: 0.8,
    height: 0.12,
    color: "#ffffff",
    text: "Wishing You Warmth & Joy",
    fontSizePt: 16,
    align: "center",
  };
  assert.equal(validDesignLayers([frame, greetingText]), true);
});

// --- Scenario 13: Emergency Passport Renewal Rush ID Layout ---
test("S13: Emergency passport renewal rush ID 8-up layout on 4R photo paper", () => {
  const passport = ID_SIZES.find((s) => s.id === "id-passport")!;
  const headshot = createMockAsset("rush-passport", passport.widthMm, passport.heightMm, 8);
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "rush-id",
    paper: "4R",
    quantity: 8,
    marginMm: 3,
  };
  const job = createPrintModeJob([headshot], config);
  assert.equal(job.total, 8);
  assert.ok(job.pages.length >= 1);
});

// --- Scenario 14: Artisan Bakery Product Labels ---
test("S14: Artisan bakery product labels with heart cut shape and 3 mm nesting gap", () => {
  const heartA = shapePolygonMm("heart", 15, 15, 45, 45);
  const heartB = shapePolygonMm("heart", 65, 15, 45, 45);
  const conflict = polygonsConflict(heartA, heartB, 3.0);
  assert.equal(conflict, false); // nested cleanly side by side
});

// --- Scenario 15: Concert Backstage Pass Series with Cut-Stack Serial Ordering ---
test("S15: Concert backstage pass series with cut-stack serial ordering across sheets", () => {
  const passAsset = createMockAsset("vip-pass", 60, 90, 1);
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "ticket",
    quantity: 16,
    numberStart: 1,
    numberDigits: 4,
    numberPrefix: "VIP-",
    numberingOrder: "cut-stack",
  };
  const job = createPrintModeJob([passAsset], config);
  assert.equal(job.total, 16);
  // Cut-stack: sheet 0 slot 0 is 1, sheet 1 slot 0 is 2
  assert.equal(job.pages[0].placements[0].serial?.text, "VIP-0001");
  assert.equal(job.pages[1].placements[0].serial?.text, "VIP-0002");
});

// --- Scenario 16: Craft Brewery Beer Bottle Label Run ---
test("S16: Craft brewery beer bottle label run with background-erased logo", () => {
  const buf = new Uint8ClampedArray(4 * 4 * 4);
  buf.fill(255);
  const cutout = removeConnectedBackground(buf, 4, 4, [255, 255, 255], 10);
  assert.ok(cutout.removed > 0);
  const labelAsset = createMockAsset("brew-label", 90, 110, 6);
  const sheets = composeSheets([labelAsset], {
    paperWidthMm: 210,
    paperHeightMm: 297,
    marginMm: 5,
    gapMm: 3,
  });
  assert.ok(sheets.length >= 1);
  assert.ok(sheets[0].placements.length >= 4);
});

// --- Scenario 17: Healthcare Clinic Appointment Reminder Pad ---
test("S17: Healthcare clinic appointment reminder pad with 2-up A5 notepad grid", () => {
  const paper = { widthMm: 148, heightMm: 210 }; // A5
  const grid = notepadGrid("2", paper, "portrait", 5);
  assert.equal(grid.columns, 1);
  assert.equal(grid.rows, 2);
  const reminderAsset = createMockAsset("appt-card", grid.artWidthMm, grid.artHeightMm, 10);
  const sheets = composeNotepadSheets([reminderAsset], "2", paper, "portrait", 5);
  assert.equal(sheets.length, 5); // 10 copies across 2-up grid = 5 sheets
});

// --- Scenario 18: E-Commerce Product Catalog Thumbnail Sheet ---
test("S18: E-commerce product catalog thumbnail sheet with cycling product images", () => {
  const products = Array.from({ length: 5 }, (_, i) =>
    createMockAsset(`prod-${i + 1}`, 35, 35, 1)
  );
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "normal",
    imageAssignment: "cycle",
    quantity: 15,
  };
  const assigned = resolveModeImageAssignments(products, config);
  assert.equal(assigned.sequence.length, 15);
  assert.equal(assigned.sequence[0].id, "prod-1");
  assert.equal(assigned.sequence[4].id, "prod-5");
  assert.equal(assigned.sequence[5].id, "prod-1"); // cycled back
});

// --- Scenario 19: Photography Portfolio Print Box Direct-to-PDF ---
test("S19: Photography portfolio print box with 600 DPI direct-to-PDF export points", () => {
  const photoW = 150;
  const photoH = 100;
  const ptW = photoW * PDF_POINTS_PER_MM;
  const ptH = photoH * PDF_POINTS_PER_MM;
  assert.ok(Math.abs(ptW - (150 * 72 / 25.4)) < 1e-6);
  assert.ok(Math.abs(ptH - (100 * 72 / 25.4)) < 1e-6);
});

// --- Scenario 20: Graphic Design Agency Business Card Proof ---
test("S20: Graphic design agency business card proof with corner trim marks", () => {
  const cr80 = { widthMm: 85.6, heightMm: 53.98 };
  const card = createMockAsset("agency-card", cr80.widthMm, cr80.heightMm, 8);
  const sheets = composeSheets([card], {
    paperWidthMm: 210,
    paperHeightMm: 297,
    marginMm: 10,
    gapMm: 4,
  });
  assert.ok(sheets.length >= 1);
  assert.ok(sheets[0].placements.length >= 8);
});

// --- Scenario 21: Non-Profit Charity Gala Ticket Run ---
test("S21: Non-profit charity gala ticket run with gold art deco vector frames", () => {
  const galaAsset = createMockAsset("gala-bg", 70, 30, 1);
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "ticket",
    quantity: 10,
    numberStart: 1001,
    numberDigits: 4,
    numberPrefix: "GALA-",
    numberingOrder: "sequential",
  };
  const job = createPrintModeJob([galaAsset], config);
  assert.equal(job.total, 10);
  assert.equal(job.pages[0].placements[0].serial?.text, "GALA-1001");
  const frame: FrameLayer = {
    id: "gala-frame",
    name: "Deco",
    kind: "frame",
    visible: true,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    color: "#d4af37",
    frameId: "deco",
    weight: 1.0,
  };
  assert.equal(validDesignLayers([frame]), true);
});

// --- Scenario 22: University Student ID Card Batch ---
test("S22: University student ID card batch with CR80 dimensions and face framing", () => {
  const cr80W = 85.6;
  const cr80H = 53.98;
  const face: FaceBounds = { x: 300, y: 250, width: 350, height: 450 };
  const crop = frameIdFace(face, 1200, 1600, cr80W, cr80H, 0.15);
  assert.ok(crop.width > 0 && crop.height > 0);
});

// --- Scenario 23: Farmers Market Honey Jar Labels with Serif Font ---
test("S23: Farmers market honey jar labels with circular crop and bundled serif font", () => {
  const polyCircle = shapePolygonMm("circle", 0, 0, 60, 60);
  assert.ok(polyCircle.length >= 20);
  const serifFont = BUNDLED_FONTS.find((f) => f.category === "Serif")!;
  const titleLayer: TextLayer = {
    id: "honey-title",
    name: "Title",
    kind: "text",
    visible: true,
    x: 0.1,
    y: 0.4,
    width: 0.8,
    height: 0.2,
    color: "#4a2c00",
    text: "Wildflower Honey",
    fontSizePt: 16,
    bundledFontId: serifFont.id,
    align: "center",
  };
  assert.equal(validDesignLayers([titleLayer]), true);
});

// --- Scenario 24: Pop-Up Boutique Discount Coupon Sheets ---
test("S24: Pop-up boutique discount coupon sheets with custom serial prefixes", () => {
  const couponAsset = createMockAsset("coupon-bg", 70, 30, 1);
  const config: PrintModeConfig = {
    ...DEFAULT_PRINT_MODE,
    mode: "ticket",
    quantity: 10,
    numberStart: 1,
    numberDigits: 3,
    numberPrefix: "SAVE20-",
    numberingOrder: "sequential",
  };
  const job = createPrintModeJob([couponAsset], config);
  assert.equal(job.total, 10);
  assert.equal(job.pages[0].placements[0].serial?.text, "SAVE20-001");
});

// --- Scenario 25: Multi-Page Family Photo Album Print Set ---
test("S25: Multi-page family photo album print sheet set with unsharp mask sharpening", () => {
  const photos = Array.from({ length: 12 }, (_, i) =>
    createMockAsset(`photo-${i + 1}`, 90, 60, 1)
  );
  const adj: PhotoAdjustments = { ...DEFAULT_ADJUSTMENTS, sharpness: 45, vibrance: 15 };
  assert.equal(validPhotoAdjustments(adj), true);
  const sheets = composeSheets(photos, {
    paperWidthMm: 210,
    paperHeightMm: 297,
    marginMm: 10,
    gapMm: 5,
  });
  assert.ok(sheets.length >= 2);
});

// --- Scenario 26: Botanical Garden Herb Marker Stakes ---
test("S26: Botanical garden herb marker stakes with leaf garland decorative borders", () => {
  const frame: FrameLayer = {
    id: "herb-garland",
    name: "Garland",
    kind: "frame",
    visible: true,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    color: "#2e6f40", // forest green
    frameId: "leaf-garland",
    weight: 1.0,
  };
  const herbName: TextLayer = {
    id: "herb-name",
    name: "Name",
    kind: "text",
    visible: true,
    x: 0.1,
    y: 0.45,
    width: 0.8,
    height: 0.15,
    color: "#1b4d2e",
    text: "Rosmarinus officinalis",
    fontSizePt: 12,
    align: "center",
  };
  assert.equal(validDesignLayers([frame, herbName]), true);
});

// --- Scenario 27: Corporate Presentation Storyboard Cards ---
test("S27: Corporate presentation storyboard cards with 12-up notepad layout", () => {
  const paper = { widthMm: 210, heightMm: 297 };
  const grid = notepadGrid("12", paper, "portrait", 3);
  assert.equal(grid.columns, 3);
  assert.equal(grid.rows, 4);
  const cardAsset = createMockAsset("storyboard-cell", grid.artWidthMm, grid.artHeightMm, 24);
  const sheets = composeNotepadSheets([cardAsset], "12", paper, "portrait", 3);
  assert.equal(sheets.length, 2); // 24 copies across 12-up grid = 2 sheets
});

// --- Scenario 28: Sports Team Roster Sticker Badges ---
test("S28: Sports team roster sticker badges with shield crop shape", () => {
  const polyShield = shapePolygonMm("shield", 0, 0, 45, 55);
  assert.ok(polyShield.length >= 7);
  const font = BUNDLED_FONTS[0];
  const numberLayer: TextLayer = {
    id: "player-num",
    name: "Jersey Number",
    kind: "text",
    visible: true,
    x: 0.1,
    y: 0.25,
    width: 0.8,
    height: 0.35,
    color: "#ffffff",
    outlinePt: 2,
    outlineColor: "#000000",
    text: "23",
    fontSizePt: 36,
    bundledFontId: font.id,
    align: "center",
  };
  assert.equal(validDesignLayers([numberLayer]), true);
});

// --- Scenario 29: Disaster Recovery of Unsaved Wedding Project ---
test("S29: Disaster recovery workflow: unsaved wedding project restored from IndexedDB draft", () => {
  const recoveryDraft: RecoveryRecord = {
    id: "draft-wedding-2026",
    revision: 14,
    updatedAt: "2026-11-04T18:30:00.000Z",
    workspaceToken: "ws-token-wedding",
    project: {
      schemaVersion: 1,
      id: "proj-wedding",
      name: "Smith-Jones Wedding Program",
      updatedAt: "2026-11-04T18:30:00.000Z",
      settings: {
        paper: "A4",
        orientation: "portrait",
        customWidthMm: 210,
        customHeightMm: 297,
        marginMm: 5,
        gapMm: 3,
        cutGuides: true,
      },
      assets: [],
    },
  };
  const activeDrafts = newestRecoveryFirst(
    { id: "a", revision: 1, updatedAt: "2026-11-04T10:00:00.000Z" },
    recoveryDraft
  );
  assert.ok(activeDrafts > 0); // newer draft sorted first
  const obsolete = obsoleteRecoveryIds([recoveryDraft], 6);
  assert.deepEqual(obsolete, []); // preserved within capacity
});

// --- Scenario 30: Multi-Tab Studio Collaboration Collision Resolution ---
test("S30: Multi-tab studio collaboration: secondary tab detects active lock and forks safely", () => {
  const hostInstance = "tab-primary-editor";
  const guestInstance = "tab-secondary-viewer";
  const probeMessage: SessionPeerMessage = {
    kind: "probe",
    token: "session-active-token",
    instance: guestInstance,
  };
  assert.equal(validSessionPeerMessage(probeMessage), true);
  // Primary established tab holds ground, does not fork
  const hostForks = shouldForkSession(hostInstance, probeMessage, true);
  assert.equal(hostForks, false);
  // Established peer message back to guest
  const presentMessage: SessionPeerMessage = {
    kind: "present",
    token: "session-active-token",
    instance: hostInstance,
  };
  // Secondary unclaimed guest tab yields and forks
  const guestForks = shouldForkSession(guestInstance, presentMessage, false);
  assert.equal(guestForks, true);
});
