import assert from "node:assert/strict";
import test from "node:test";
import { effectiveCropDpi, moveCropRegion, resizeCropRegion,
  validCustomPolygon, validPerspectiveQuad } from "./studioGeometry.ts";

const initial = { x: .2, y: .2, width: .4, height: .4 };
const handles = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const;

test("all eight resize handles adjust the requested source edges", () => {
  for (const handle of handles) {
    const next = resizeCropRegion(initial, handle, .05, .04);
    const horizontal = handle.includes("e") || handle.includes("w");
    const vertical = handle.includes("n") || handle.includes("s");
    assert.equal(next.width !== initial.width, horizontal, handle + " width");
    assert.equal(next.height !== initial.height, vertical, handle + " height");
    assert.ok(next.x >= 0 && next.y >= 0 &&
      next.x + next.width <= 1.00000001 &&
      next.y + next.height <= 1.00000001, handle + " bounds");
  }
});

test("corner aspect lock keeps opposite corner fixed", () => {
  const next = resizeCropRegion(initial, "se", .1, .06, { ratio: 1 });
  assert.ok(Math.abs(next.width - next.height) < 1e-12);
  assert.equal(next.x, initial.x);
  assert.equal(next.y, initial.y);
});

test("edge aspect lock resizes around perpendicular center", () => {
  const next = resizeCropRegion(initial, "e", .08, 0, { ratio: 2 });
  assert.ok(Math.abs(next.width / next.height - 2) < 1e-12);
  assert.equal(next.x, initial.x);
  assert.ok(Math.abs(next.y + next.height / 2 - .4) < 1e-12);
});

test("resize clamps to source bounds; bad geometry never escapes", () => {
  const next = resizeCropRegion(initial, "nw", -100, -100);
  assert.equal(next.x, 0);
  assert.equal(next.y, 0);
  assert.ok(Math.abs(next.x + next.width - .6) < 1e-12);
  assert.ok(Math.abs(next.y + next.height - .6) < 1e-12);
  assert.deepEqual(moveCropRegion(initial, -9, 9), { ...initial, x: 0, y: .6 });
  assert.throws(() => resizeCropRegion(initial, "e", NaN, 0), /Invalid/);
  assert.throws(() => resizeCropRegion(initial, "e", 0, 0, { ratio: 0 }), /aspect/);
});

test("concave geometry is accepted but self-intersecting and collinear polygons are rejected", () => {
  const concave = [{x:0,y:0},{x:1,y:0},{x:.5,y:.5},{x:1,y:1},{x:0,y:1}];
  assert.equal(validCustomPolygon(concave), true);
  const bowtie = [{x:0,y:0},{x:1,y:1},{x:0,y:1},{x:1,y:0}];
  assert.equal(validCustomPolygon(bowtie), false);
  assert.equal(validCustomPolygon([{x:0,y:0},{x:.5,y:0},{x:1,y:0}]), false);
  assert.equal(validCustomPolygon([{x:0,y:0},{x:1,y:0},{x:1,y:0},{x:0,y:1}]), false);
  assert.equal(validCustomPolygon(Array.from({length:129},()=>({x:0,y:0}))), false);
});

test("perspective quad must be convex with meaningful area", () => {
  assert.equal(validPerspectiveQuad([{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]), true);
  assert.equal(validPerspectiveQuad([{x:0,y:0},{x:1,y:0},{x:.1,y:.1},{x:0,y:1}]), false);
  assert.equal(validPerspectiveQuad([{x:0,y:0},{x:1,y:1},{x:1,y:0},{x:0,y:1}]), false);
  assert.equal(validPerspectiveQuad([{x:0,y:0},{x:1,y:0},{x:1,y:.00001},{x:0,y:.00001}]), false);
});

test("source DPI uses retained source pixels, not upscaled preview size", () => {
  const dpi = effectiveCropDpi(2400, 1200, { x: .25, y: 0, width: .5, height: 1 }, 50.8, 50.8);
  assert.ok(Math.abs(dpi - 600) < 1e-10);
  assert.throws(() => effectiveCropDpi(0, 1000, initial, 25.4, 25.4), /Invalid/);
});
