import assert from "node:assert/strict";
import test from "node:test";
import { composeSheets, getPaperDimensions, MM_PER_INCH, PDF_POINTS_PER_MM } from "./layout.ts";

const A4 = { paperWidthMm: 210, paperHeightMm: 297, marginMm: 5, gapMm: 3 };

test("international dimensions and PDF conversion", () => {
  assert.equal(MM_PER_INCH, 25.4);
  assert.ok(Math.abs(50.8 * PDF_POINTS_PER_MM - 144) < 1e-10);
  assert.deepEqual(getPaperDimensions("A4", "landscape"), { widthMm: 297, heightMm: 210 });
  assert.deepEqual(getPaperDimensions("A3", "portrait"), { widthMm: 297, heightMm: 420 });
});

test("2x2 inch portraits tile without overflow and paginate exactly", () => {
  const pages = composeSheets([{ id: "photo", widthMm: 50.8, heightMm: 50.8, quantity: 30 }], A4);
  assert.equal(pages.reduce((sum, page) => sum + page.placements.length, 0), 30);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].placements.length, 15);
  for (const page of pages) {
    for (const p of page.placements) {
      assert.ok(p.xMm >= 5 && p.yMm >= 5);
      assert.ok(p.xMm + p.widthMm <= 205 + 1e-7);
      assert.ok(p.yMm + p.heightMm <= 292 + 1e-7);
    }
    for (let i = 0; i < page.placements.length; i++) {
      for (let j = i + 1; j < page.placements.length; j++) {
        const a = page.placements[i]; const b = page.placements[j];
        const overlaps = a.xMm < b.xMm + b.widthMm - 1e-7 &&
          b.xMm < a.xMm + a.widthMm - 1e-7 &&
          a.yMm < b.yMm + b.heightMm - 1e-7 &&
          b.yMm < a.yMm + a.heightMm - 1e-7;
        assert.equal(overlaps, false);
      }
    }
  }
});

test("preserves quantity of multiple different items", () => {
  const pages = composeSheets([
    { id: "a", widthMm: 50, heightMm: 50, quantity: 9 },
    { id: "b", widthMm: 80, heightMm: 30, quantity: 6 },
  ], A4);
  assert.equal(pages.flatMap((p) => p.placements).filter((p) => p.itemId === "a").length, 9);
  assert.equal(pages.flatMap((p) => p.placements).filter((p) => p.itemId === "b").length, 6);
});

test("exactly fitting images at zero margin and gap", () => {
  const pages = composeSheets([{ id: "x", widthMm: 100, heightMm: 100, quantity: 5 }],
    { paperWidthMm: 200, paperHeightMm: 200, marginMm: 0, gapMm: 0 });
  assert.equal(pages.length, 2);
  assert.equal(pages[0].placements.length, 4);
});

test("rejects invalid inputs safely", () => {
  assert.deepEqual(composeSheets([], A4), []);
  assert.throws(() => composeSheets([{ id: "x", widthMm: 300, heightMm: 10, quantity: 1 }], A4), /larger/);
  assert.throws(() => composeSheets([{ id: "x", widthMm: 50, heightMm: 50, quantity: 1.5 }], A4), /integer/);
  assert.throws(() => composeSheets([], { ...A4, marginMm: 110 }), /Margins/);
  assert.throws(() => composeSheets([], { ...A4, gapMm: -1 }), /nonnegative/);
  assert.throws(() => composeSheets([{ id: "x", widthMm: 20, heightMm: 20, quantity: 1001 }], A4), /1,000/);
});
