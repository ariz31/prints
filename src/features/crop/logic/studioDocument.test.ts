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
