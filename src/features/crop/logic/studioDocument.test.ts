import assert from "node:assert/strict";
import test from "node:test";
import { CROP_STUDIO_SCHEMA_VERSION, migrateLegacyCropStudio,
  validCropStudioDocument } from "./studioDocument.ts";

const legacy = {
  crop: { x: .25, y: 0, width: .5, height: 1 },
  cropShape: "circle" as const,
  widthMm: 50.8, heightMm: 50.8,
};

test("migrate a legacy crop without duplicating image transform or frame layers", () => {
  const doc = migrateLegacyCropStudio(legacy);
  assert.equal(doc.schemaVersion, CROP_STUDIO_SCHEMA_VERSION);
  assert.deepEqual(doc.crop, legacy.crop);
  assert.equal(doc.shape.preset, "circle");
  assert.equal(doc.imageTransform.rotationDeg, 0);
  assert.equal(doc.frame.presetId, undefined);
  assert.equal(doc.output.widthMm, 50.8);
  assert.equal(validCropStudioDocument(doc), true);
  assert.notEqual(doc.crop, legacy.crop);
});

test("v2 document permits one validated concave custom contour", () => {
  const doc = migrateLegacyCropStudio(legacy);
  doc.shape = { preset: "custom",
    vertices: [{x:0,y:0},{x:1,y:0},{x:.5,y:.4},{x:1,y:1},{x:0,y:1}],
    rotationDeg: 12, flipX: false, flipY: false, cornerCurvature: 0 };
  doc.imageTransform.perspective = [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
  doc.frame.presetId = "hairline";
  doc.frame.borderOpacity = .4;
  doc.frame.fit = "fit";
  assert.equal(validCropStudioDocument(doc), true);
  assert.equal(validCropStudioDocument({...doc, crop: [doc.crop, doc.crop]}), false);
});

test("reject unknown versions and malformed unsupported geometry", () => {
  const doc = migrateLegacyCropStudio(legacy);
  assert.equal(validCropStudioDocument({...doc, schemaVersion: 3}), false);
  assert.equal(validCropStudioDocument({...doc, cropRegions: [doc.crop]}), false);
  assert.equal(validCropStudioDocument({...doc, output: {...doc.output, widthMm: NaN}}), false);
  assert.equal(validCropStudioDocument({...doc, frame: {...doc.frame, borderOpacity: 2}}), false);
  assert.equal(validCropStudioDocument({...doc, imageTransform: {...doc.imageTransform,
    perspective: [{x:0,y:0},{x:1,y:1},{x:1,y:0},{x:0,y:1}]}}), false);
  assert.equal(validCropStudioDocument({...doc, shape: {...doc.shape, preset: "custom"}}), false);
  assert.throws(() => migrateLegacyCropStudio({...legacy, widthMm: -1}), /Invalid/);
  assert.throws(() => migrateLegacyCropStudio({...legacy, dpi: Infinity}), /Invalid/);
});


test("locked output aspect must agree with the physical print aspect", () => {
  const doc = migrateLegacyCropStudio(legacy);
  assert.equal(validCropStudioDocument({ ...doc, aspect: { locked: true, ratio: 1.2 } }), false);
  assert.equal(validCropStudioDocument({ ...doc, aspect: { locked: false, ratio: 1.2 } }), true);
  assert.equal(validCropStudioDocument({ ...doc, output: { ...doc.output, widthMm: 70 } }), false);
});

test("combined skew is non-singular and protects inverse perspective sampling", () => {
  const doc = migrateLegacyCropStudio(legacy);
  assert.equal(validCropStudioDocument({ ...doc, imageTransform: {
    ...doc.imageTransform, skewXDeg: 45, skewYDeg: 45
  } }), false);
  assert.equal(validCropStudioDocument({ ...doc, imageTransform: {
    ...doc.imageTransform, skewXDeg: 44.9, skewYDeg: 44.9
  } }), false);
  assert.equal(validCropStudioDocument({ ...doc, imageTransform: {
    ...doc.imageTransform, skewXDeg: 20, skewYDeg: -20
  } }), true);
});

test("frame geometry rejects invisible background colors and physically impossible rails", () => {
  const doc = migrateLegacyCropStudio(legacy);
  assert.equal(validCropStudioDocument({ ...doc, frame: {
    ...doc.frame, backgroundOpacity: 0.5
  } }), false);
  assert.equal(validCropStudioDocument({ ...doc, frame: {
    ...doc.frame, backgroundOpacity: 0.5, backgroundColor: "#aabbcc"
  } }), true);
  assert.equal(validCropStudioDocument({ ...doc, frame: {
    ...doc.frame, bounds: { x: 0, y: 0, width: 0.01, height: 0.01 },
    borderThicknessMm: 2
  } }), false);
  assert.equal(validCropStudioDocument({ ...doc, frame: {
    ...doc.frame, radiusMm: 30
  } }), false);
});

test("legacy projects with sub-0.1 mm positive dimensions remain migratable", () => {
  const doc = migrateLegacyCropStudio({ ...legacy, widthMm: 0.05 });
  assert.equal(doc.output.widthMm, 0.05);
  assert.equal(validCropStudioDocument(doc), true);
});

test("reject nested unknown crop metadata instead of silently discarding it", () => {
  const doc = migrateLegacyCropStudio(legacy);
  assert.equal(validCropStudioDocument({ ...doc, crop: {
    ...doc.crop, regions: [doc.crop]
  } }), false);
  assert.equal(validCropStudioDocument({ ...doc, shape: {
    preset: "custom",
    vertices: [{ x: 0, y: 0, unused: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
    rotationDeg: 0, flipX: false, flipY: false, cornerCurvature: 0
  } }), false);
});
