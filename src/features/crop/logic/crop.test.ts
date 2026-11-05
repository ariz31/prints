import assert from "node:assert/strict";
import test from "node:test";
import { coverSourceRect, dragCrop, FULL_CROP, normalizeCrop } from "./crop.ts";

test("drag crop normalizes backwards selections", () => {
  const selection = dragCrop({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.1 });
  for (const [key, expected] of Object.entries({ x: 0.2, y: 0.1, width: 0.6, height: 0.6 })) {
    assert.ok(Math.abs(selection[key as keyof typeof selection] - expected) < 1e-10, key);
  }
});
test("invalid crop restores unmodified source and clips edges", () => {
  assert.deepEqual(normalizeCrop({ x: NaN, y: 0, width: 1, height: 1 }), FULL_CROP);
  const crop = normalizeCrop({ x: 0.9, y: 0.8, width: 0.5, height: 0.5 });
  assert.ok(crop.x + crop.width <= 1);
  assert.ok(crop.y + crop.height <= 1);
});
test("cover crop chooses correct subrectangle for exact photo ratio", () => {
  assert.deepEqual(coverSourceRect(4000, 2000, FULL_CROP, 1000, 1000),
    { sx: 1000, sy: 0, sw: 2000, sh: 2000 });
  assert.deepEqual(coverSourceRect(4000, 2000, FULL_CROP, 1000, 1000, 0),
    { sx: 0, sy: 0, sw: 2000, sh: 2000 });
});
test("source selection and cover offsets compose", () => {
  const rect = coverSourceRect(2000, 1000,
    { x: .25, y: .2, width: .5, height: .6 }, 600, 600);
  assert.deepEqual(rect, { sx: 700, sy: 200, sw: 600, sh: 600 });
  assert.throws(() => coverSourceRect(0, 20, FULL_CROP, 100, 100), /positive/);
});
