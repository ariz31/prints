import assert from "node:assert/strict";
import test from "node:test";
import { removeConnectedBackground, paintAlphaBrush } from "./background.ts";

test("removes connected border color but preserves isolated inside color", () => {
  const width = 5, height = 5;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const background = i % width === 0 || i % width === 4 || i < 5 || i >= 20 || i === 12;
    pixels.set(background ? [255, 255, 255, 255] : [0, 0, 0, 255], i * 4);
  }
  const result = removeConnectedBackground(pixels, width, height, [255, 255, 255], 0);
  assert.equal(result.removed, 16);
  assert.equal(result.pixels[12 * 4 + 3], 255);
  assert.equal(result.pixels[0 * 4 + 3], 0);
  assert.equal(pixels[3], 255, "original unmodified");
});

test("corner matching is tolerant while unrelated border stays visible", () => {
  const image = new Uint8ClampedArray([250,248,251,255, 0,0,0,255]);
  const result = removeConnectedBackground(image, 2, 1, [255,255,255], 20);
  assert.equal(result.removed, 1);
  assert.equal(result.pixels[3], 0);
  assert.equal(result.pixels[7], 255);
});
test("brush erases and restores from immutable source", () => {
  const original = new Uint8ClampedArray([20,30,40,255, 100,110,120,255,
    50,60,70,255, 80,90,100,255]);
  const pixels = new Uint8ClampedArray(original);
  paintAlphaBrush(pixels, original, 2, 2, 0, 0, 0.5, "erase");
  assert.equal(pixels[3], 0);
  paintAlphaBrush(pixels, original, 2, 2, 0, 0, 0.5, "restore");
  assert.deepEqual(pixels, original);
});
test("rejects invalid data safely", () => {
  assert.throws(() => removeConnectedBackground(new Uint8ClampedArray(0), 3, 3, [0,0,0], 20), /Invalid/);
  assert.throws(() => removeConnectedBackground(new Uint8ClampedArray(4), 1, 1, [0,0,0], 999), /Invalid/);
});
