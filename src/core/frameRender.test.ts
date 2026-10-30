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
    moveTo: (x:number,y:number) => calls.push(["moveTo",x,y]),
    lineTo: (x:number,y:number) => calls.push(["lineTo",x,y]),
    ellipse: (x:number,y:number,rx:number,ry:number) => calls.push(["ellipse",x,y,rx,ry]),
    closePath: () => calls.push(["closePath"]), fill: () => calls.push(["fill"]),
    rect: (x: number, y: number, w: number, h: number) => calls.push(["rect", x, y, w, h]),
    lineWidth: 0, lineCap: "", lineJoin: "", strokeStyle: "", fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
  drawFrameCanvas(ctx, { frameId: "hairline", widthMm: 80, heightMm: 40, weight: 1,
    x: 10, y: 20, width: 800, height: 400, color: "#123456" });
  assert.deepEqual(calls[0], ["save"]);
  assert.deepEqual(calls[1], ["translate", 10, 20]);
  assert.deepEqual(calls[2], ["scale", 10, 10]);
  const rectangle = calls.find(call => call[0] === "rect")!;
  near(rectangle[1], 3.44); near(rectangle[2], 3.44);
  near(rectangle[3], 73.12); near(rectangle[4], 33.12);
  assert.deepEqual(calls.at(-1), ["restore"]);
});

test("PDF frame places the top-left design correctly and preserves transparency", () => {
  const rectangles: Record<string, unknown>[] = [];
  const page = {
    pushOperators: () => {},
    drawRectangle: (options: Record<string, unknown>) => rectangles.push(options),
    drawEllipse: (_options: Record<string, unknown>) => {},
    drawLine: (_options: Record<string, unknown>) => {},
    drawSvgPath: (_path: string, _options: Record<string, unknown>) => {},
  } as unknown as PDFPage;
  const color = rgb(.2, .3, .4);
  drawFramePdf(page, { frameId: "hairline", widthMm: 80, heightMm: 40, weight: 1,
    left: 25, top: 400, color, opacity: .4 });
  assert.equal(rectangles.length, 1);
  const rect = rectangles[0];
  near(rect.x as number, 25 + 3.44 * PDF_POINTS_PER_MM);
  near(rect.y as number, 400 - (3.44 + 33.12) * PDF_POINTS_PER_MM);
  near(rect.width as number, 73.12 * PDF_POINTS_PER_MM);
  near(rect.height as number, 33.12 * PDF_POINTS_PER_MM);
  near(rect.borderWidth as number, .12 * PDF_POINTS_PER_MM);
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


test("seasonal canvas frames retain multicolor accents alongside the selected rail color", () => {
  const paints: string[] = [];
  const ctx = {
    strokeStyle: "", fillStyle: "", lineWidth: 1, lineCap: "", lineJoin: "",
    save() {}, restore() {}, translate() {}, scale() {}, beginPath() {}, fill() {},
    moveTo() {}, lineTo() {}, rect() {}, ellipse() {}, closePath() {},
    stroke() { paints.push(String(ctx.strokeStyle)); },
  } as unknown as CanvasRenderingContext2D;
  drawFrameCanvas(ctx, { frameId: "christmas-holly", widthMm: 100, heightMm: 150,
    weight: 1, x: 0, y: 0, width: 1000, height: 1500, color: "#ffffff" });
  assert.ok(paints.includes("#ffffff"), "the selected rail color remains active");
  assert.ok(paints.includes("#286e50"), "holly foliage receives the curated green");
  assert.ok(paints.includes("#bd3647"), "berries receive the curated red");
});

test("seasonal vector PDF export retains distinct motif colors and layer opacity", () => {
  const draws: Record<string, unknown>[] = [];
  const page = {
    pushOperators() {},
    drawLine(options: Record<string, unknown>) { draws.push(options); },
    drawRectangle(options: Record<string, unknown>) { draws.push(options); },
    drawEllipse(options: Record<string, unknown>) { draws.push(options); },
    drawSvgPath(_path: string, options: Record<string, unknown>) { draws.push(options); },
  } as unknown as PDFPage;
  const chosen = rgb(1, 1, 1);
  drawFramePdf(page, { frameId: "christmas-holly", widthMm: 100, heightMm: 150,
    weight: 1, left: 0, top: 500, color: chosen, opacity: .45 });
  const paints = draws.map(options => options.borderColor ?? options.color);
  assert.ok(paints.some(paint => paint === chosen), "the selected rail color survives export");
  assert.ok(paints.some(paint => paint !== chosen), "curated accent color survives export");
  assert.ok(draws.every(options => options.borderOpacity === .45 || options.opacity === .45),
    "all vector strokes retain layer opacity");
});
