import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { createCalibrationPdf, validateCalibrationPaper } from "./calibration.ts";
import { PDF_POINTS_PER_MM } from "./layout.ts";

test("calibration PDF uses exact A4 physical dimensions", async () => {
  const blob = await createCalibrationPdf({ widthMm: 210, heightMm: 297 });
  const pdf = await PDFDocument.load(await blob.arrayBuffer());
  assert.equal(pdf.getPageCount(), 1);
  const page = pdf.getPages()[0];
  assert.ok(Math.abs(page.getWidth() - 210 * PDF_POINTS_PER_MM) < 0.02);
  assert.ok(Math.abs(page.getHeight() - 297 * PDF_POINTS_PER_MM) < 0.02);
});
test("A3 landscape and invalid paper bounds", async () => {
  const pdf = await PDFDocument.load(await (await createCalibrationPdf({ widthMm: 420, heightMm: 297 })).arrayBuffer());
  assert.ok(Math.abs(pdf.getPages()[0].getWidth() - 420 * PDF_POINTS_PER_MM) < .02);
  assert.throws(() => validateCalibrationPaper({ widthMm: 100, heightMm: 297 }), /at least/);
  await assert.rejects(createCalibrationPdf({ widthMm: Infinity, heightMm: 297 }), /at least/);
});
