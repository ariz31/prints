import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, rgb } from "pdf-lib";
import type { PDFPage } from "pdf-lib";
import { drawFrameCanvas } from "./frameCanvas.ts";
import { drawFramePdf } from "./framePdf.ts";
import { FRAME_PRESETS } from "./frames.ts";
import { PDF_POINTS_PER_MM } from "./layout.ts";

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
}

test("frame canvas maps millimeters into the image rectangle and restores caller state", () => {
  const calls: [string, ...number[]][] = [];
  const ctx = {
    save: () => calls.push(["save"]), restore: () => calls.push(["restore"]),
    translate: (x: number, y: number) => calls.push(["translate", x, y]),
    scale: (x: number, y: number) => calls.push(["scale", x, y]),
    beginPath: () => calls.push(["beginPath"]), stroke: () => calls.push(["stroke"]),
    rect: (x: number, y: number, w: number, h: number) => calls.push(["rect", x, y, w, h]),
    lineWidth: 0, lineCap: "", lineJoin: "", strokeStyle: "", fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
  drawFrameCanvas(ctx, { frameId: "hairline", widthMm: 80, heightMm: 40, weight: 1,
    x: 10, y: 20, width: 800, height: 400, color: "#123456" });
  assert.deepEqual(calls[0], ["save"]);
  assert.deepEqual(calls[1], ["translate", 10, 20]);
  assert.deepEqual(calls[2], ["scale", 10, 10]);
  const rectangle = calls.find(call => call[0] === "rect")!;
  near(rectangle[1], 1.8); near(rectangle[2], 1.8);
  near(rectangle[3], 76.4); near(rectangle[4], 36.4);
  assert.deepEqual(calls.at(-1), ["restore"]);
});

test("PDF frame places the top-left design correctly and preserves transparency", () => {
  const rectangles: Record<string, unknown>[] = [];
  const page = {
    pushOperators: () => {},
    drawRectangle: (options: Record<string, unknown>) => rectangles.push(options),
  } as unknown as PDFPage;
  const color = rgb(.2, .3, .4);
  drawFramePdf(page, { frameId: "hairline", widthMm: 80, heightMm: 40, weight: 1,
    left: 25, top: 400, color, opacity: .4 });
  assert.equal(rectangles.length, 1);
  const rect = rectangles[0];
  near(rect.x as number, 25 + 1.8 * PDF_POINTS_PER_MM);
  near(rect.y as number, 400 - (1.8 + 36.4) * PDF_POINTS_PER_MM);
  near(rect.width as number, 76.4 * PDF_POINTS_PER_MM);
  near(rect.height as number, 36.4 * PDF_POINTS_PER_MM);
  near(rect.borderWidth as number, .20 * PDF_POINTS_PER_MM);
  assert.equal(rect.borderOpacity, .4);
  assert.equal(rect.color, undefined); // The image remains visible inside the frame.
});

test("all frame presets produce valid vector PDF content in both orientations", async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  for (const preset of FRAME_PRESETS) for (const [widthMm, heightMm] of [[40, 80], [80, 40]]) {
    drawFramePdf(page, { frameId: preset.id, widthMm, heightMm, weight: 1,
      left: 20, top: 700, color: rgb(0, 0, 0), opacity: .6 });
  }
  const bytes = await pdf.save();
  const restored = await PDFDocument.load(bytes);
  assert.equal(restored.getPageCount(), 1);
  assert.ok(bytes.byteLength > 1000);
});
