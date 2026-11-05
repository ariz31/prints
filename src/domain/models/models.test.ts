import test from "node:test";
import assert from "node:assert/strict";
import {
  CROP_SHAPES,
  FULL_CROP,
  validCropShape,
  type CropRegion,
} from "./crop.ts";
import {
  PAPER_SIZES,
  PAPER_GROUPS,
  isPaperName,
  type SheetPage,
  type Placement,
} from "./sheet.ts";
import {
  PHOTO_EDIT_SCHEMA_VERSION,
  DEFAULT_ADJUSTMENTS,
  type PhotoAsset,
  type StoredAsset,
} from "./asset.ts";
import {
  PRINT_MODES,
  DEFAULT_PRINT_MODE,
} from "./printMode.ts";
import {
  TRASH_RETENTION_DAYS,
  type ProjectSettings,
  type StoredProject,
} from "./project.ts";
import {
  WORKFLOW_OPERATIONS,
  REVIEW_MODES,
  validateWorkflow,
  type SavedWorkflow,
} from "./workflow.ts";
import {
  DEFAULT_PREFERENCES,
  isValidPreferences,
  type UserPreferences,
} from "./preferences.ts";
import { validDesignLayers } from "../../core/layers.ts";

test("crop models and validCropShape type guard", () => {
  assert.equal(CROP_SHAPES.length, 15);
  assert.equal(FULL_CROP.x, 0);
  assert.equal(FULL_CROP.y, 0);
  assert.equal(FULL_CROP.width, 1);
  assert.equal(FULL_CROP.height, 1);

  assert.equal(validCropShape("rectangle"), true);
  assert.equal(validCropShape("heart"), true);
  assert.equal(validCropShape("invalid-shape"), false);
  assert.equal(validCropShape(null), false);
  assert.equal(validCropShape(123), false);
  assert.equal(validCropShape(undefined), false);

  const customCrop: CropRegion = { x: 0.1, y: 0.2, width: 0.8, height: 0.6 };
  assert.equal(customCrop.width, 0.8);
});

test("sheet models and isPaperName type guard", () => {
  assert.equal(isPaperName("A4"), true);
  assert.equal(isPaperName("Custom"), true);
  assert.equal(isPaperName("Letter"), true);
  assert.equal(isPaperName("NonExistentPaper"), false);
  assert.equal(isPaperName(null), false);
  assert.equal(isPaperName({}), false);

  assert.equal(PAPER_GROUPS.length > 0, true);
  assert.equal(PAPER_SIZES.A4.widthMm, 210);
  assert.equal(PAPER_SIZES.A4.heightMm, 297);

  const p: Placement = {
    itemId: "img-1",
    copyIndex: 0,
    xMm: 10,
    yMm: 15,
    widthMm: 50,
    heightMm: 70,
  };
  const page: SheetPage = {
    pageNumber: 1,
    placements: [p],
  };
  assert.equal(page.placements.length, 1);
});

test("asset models and defaults", () => {
  assert.equal(PHOTO_EDIT_SCHEMA_VERSION, 1);
  assert.equal(DEFAULT_ADJUSTMENTS.brightness, 0);
  assert.equal(DEFAULT_ADJUSTMENTS.contrast, 0);
  assert.equal(DEFAULT_ADJUSTMENTS.saturation, 0);

  const asset: PhotoAsset = {
    id: "a1",
    name: "photo.jpg",
    url: "blob:test",
    pixelWidth: 800,
    pixelHeight: 600,
    widthMm: 50,
    heightMm: 70,
    quantity: 1,
    crop: FULL_CROP,
    focalX: 0.5,
    focalY: 0.5,
  };
  assert.equal(asset.name, "photo.jpg");

  const blob = new Blob(["dummy"]);
  const stored: StoredAsset = {
    id: "a1",
    name: "photo.jpg",
    pixelWidth: 800,
    pixelHeight: 600,
    widthMm: 50,
    heightMm: 70,
    quantity: 1,
    crop: FULL_CROP,
    focalX: 0.5,
    focalY: 0.5,
    original: blob,
  };
  assert.equal(stored.id, "a1");
});

test("printMode and project models", () => {
  assert.equal(PRINT_MODES.length, 6);
  assert.equal(DEFAULT_PRINT_MODE.mode, "normal");
  assert.equal(TRASH_RETENTION_DAYS, 30);

  const settings: ProjectSettings = {
    paper: "A4",
    orientation: "portrait",
    customWidthMm: 210,
    customHeightMm: 297,
    marginMm: 5,
    gapMm: 3,
    cutGuides: true,
  };
  const proj: StoredProject = {
    schemaVersion: 1,
    id: "proj-1",
    name: "Test Project",
    updatedAt: "2026-11-04T00:00:00Z",
    settings,
    assets: [],
  };
  assert.equal(proj.schemaVersion, 1);
});

test("workflow validation guard", () => {
  assert.equal(WORKFLOW_OPERATIONS.length, 11);

  const validWf: SavedWorkflow = {
    schemaVersion: 1,
    id: "wf-1",
    name: "Sample Workflow",
    description: "Description",
    updatedAt: "2026-11-04T00:00:00Z",
    steps: [
      {
        id: "s1",
        operation: "crop.to-size",
        enabled: true,
        reviewMode: "never",
        parameters: { widthMm: 50, heightMm: 70 },
      },
    ],
  };
  assert.equal(validateWorkflow(validWf), true);
  assert.equal(validateWorkflow({ invalid: true }), false);
  assert.equal(validateWorkflow(null), false);
});

test("preferences validation guard", () => {
  assert.equal(DEFAULT_PREFERENCES.unit, "mm");
  assert.equal(isValidPreferences(DEFAULT_PREFERENCES), true);

  const customPrefs: UserPreferences = {
    unit: "in",
    defaultPaper: "Letter",
    defaultOrientation: "landscape",
    defaultMarginMm: 10,
    defaultGapMm: 5,
    defaultCutGuides: false,
    autoSave: false,
  };
  assert.equal(isValidPreferences(customPrefs), true);
  assert.equal(isValidPreferences({ unit: "cubits" }), false);
  assert.equal(isValidPreferences(null), false);
});

test("workflow validation guard adversarial hardening", () => {
  assert.equal(REVIEW_MODES.length, 3);
  const step = {
    id: "s1",
    operation: "crop.to-size" as const,
    enabled: true,
    reviewMode: "never" as const,
    parameters: { widthMm: 50.8, heightMm: 50.8 },
  };
  const wf: SavedWorkflow = {
    schemaVersion: 1,
    id: "wf-1",
    name: "Test",
    description: "",
    updatedAt: "2026-11-04T00:00:00Z",
    steps: [step],
  };

  // 1. Sparse arrays & holes
  assert.equal(validateWorkflow({ ...wf, steps: new Array(5) }), false);
  assert.equal(validateWorkflow({ ...wf, steps: [step, , { ...step, id: "s2" }] }), false);
  const trailingHole = [step];
  trailingHole.length = 3;
  assert.equal(validateWorkflow({ ...wf, steps: trailingHole }), false);
  const deletedHole = [step, { ...step, id: "s2" }];
  delete (deletedHole as unknown as Record<number, unknown>)[0];
  assert.equal(validateWorkflow({ ...wf, steps: deletedHole }), false);

  // 2. reviewMode type confusion
  assert.equal(validateWorkflow({ ...wf, steps: [{ ...step, reviewMode: ["never"] as unknown as "never" }] }), false);
  assert.equal(validateWorkflow({ ...wf, steps: [{ ...step, reviewMode: { toString: () => "never" } as unknown as "never" }] }), false);
  assert.equal(validateWorkflow({ ...wf, steps: [{ ...step, reviewMode: 123 as unknown as "never" }] }), false);

  // 3. Throwing getters & methods
  assert.equal(validateWorkflow({ get schemaVersion() { throw new Error("Boom"); } }), false);
  assert.equal(validateWorkflow({ ...wf, get steps() { throw new Error("Boom"); } }), false);
  assert.equal(validateWorkflow({ ...wf, steps: [{ get id() { throw new Error("Boom"); } }] }), false);
  assert.equal(validateWorkflow({ ...wf, steps: [{ ...step, reviewMode: { toString() { throw new Error("Boom"); } } as unknown as "never" }] }), false);
  assert.equal(validateWorkflow({ ...wf, steps: [{ ...step, get parameters() { throw new Error("Boom"); } }] }), false);
});

test("preferences validation guard adversarial hardening", () => {
  // 1. Array and Object coercion rejection
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, unit: ["mm"] }), false);
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, defaultOrientation: ["portrait"] }), false);
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, unit: { toString: () => "mm" } }), false);
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, defaultOrientation: { toString: () => "portrait" } }), false);

  // 2. Throwing getters and methods
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, get unit() { throw new Error("Throwing unit"); } }), false);
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, get defaultOrientation() { throw new Error("Throwing orientation"); } }), false);
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, get defaultPaper() { throw new Error("Throwing paper"); } }), false);
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, get defaultMarginMm() { throw new Error("Throwing margin"); } }), false);
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, unit: { toString() { throw new Error("Throwing toString"); } } }), false);

  // 3. Array payload & Prototype pollution rejection
  assert.equal(isValidPreferences([DEFAULT_PREFERENCES]), false);
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, defaultPaper: "__proto__" }), false);
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, defaultPaper: "constructor" }), false);

  // 4. Number bounds and non-finite values
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, defaultMarginMm: 0 }), true);
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, defaultMarginMm: 199.999 }), true);
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, defaultMarginMm: 200 }), false);
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, defaultMarginMm: -0.001 }), false);
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, defaultMarginMm: NaN }), false);
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, defaultMarginMm: Infinity }), false);
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, defaultGapMm: 0 }), true);
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, defaultGapMm: 200 }), false);
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, defaultCustomWidthMm: 0 }), false);
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, defaultCustomWidthMm: 2000 }), true);
  assert.equal(isValidPreferences({ ...DEFAULT_PREFERENCES, defaultCustomWidthMm: 2000.1 }), false);
});

test("layers validation guard adversarial hardening", () => {
  // 1. Sparse arrays & holes
  assert.equal(validDesignLayers(new Array(5)), false);
  assert.equal(validDesignLayers([, ,]), false);

  const validTextLayer = {
    id: "l1",
    name: "Caption",
    visible: true,
    color: "#000000",
    kind: "text" as const,
    x: 0.1,
    y: 0.1,
    width: 0.5,
    height: 0.2,
    text: "Sample",
    fontSizePt: 12,
  };
  assert.equal(validDesignLayers([validTextLayer]), true);
  assert.equal(validDesignLayers([validTextLayer, , validTextLayer]), false);

  // 2. Type coercion rejection
  assert.equal(validDesignLayers([{ ...validTextLayer, kind: ["text"] as unknown as "text" }]), false);
  assert.equal(validDesignLayers([{ ...validTextLayer, fontFamily: ["Helvetica"] as unknown as "Helvetica" }]), false);
  assert.equal(validDesignLayers([{ ...validTextLayer, align: ["left"] as unknown as "left" }]), false);
  assert.equal(validDesignLayers([{ ...validTextLayer, kind: { toString: () => "text" } as unknown as "text" }]), false);

  // 3. Throwing getters
  assert.equal(validDesignLayers([{ ...validTextLayer, get kind() { throw new Error("Throwing kind"); } }]), false);
  assert.equal(validDesignLayers([{ ...validTextLayer, get visible() { throw new Error("Throwing visible"); } }]), false);
  assert.equal(validDesignLayers({ length: 1, 0: validTextLayer }), false);
});
