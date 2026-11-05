import assert from "node:assert/strict";
import { test } from "node:test";
import { UniformSpatialGrid2D, boxesIntersect } from "./spatialGrid.ts";

test("boxesIntersect accurately detects overlap and gap clearance", () => {
  const b1 = { minX: 10, minY: 10, maxX: 30, maxY: 30 };
  const b2 = { minX: 35, minY: 10, maxX: 55, maxY: 30 };

  // Disjoint without gap
  assert.equal(boxesIntersect(b1, b2, 0), false);
  // Touching or overlapping when gap >= 5
  assert.equal(boxesIntersect(b1, b2, 4), false);
  assert.equal(boxesIntersect(b1, b2, 6), true);

  const b3 = { minX: 20, minY: 20, maxX: 40, maxY: 40 };
  assert.equal(boxesIntersect(b1, b3, 0), true);
});

test("UniformSpatialGrid2D validates dimensions and computes cell counts", () => {
  assert.throws(() => new UniformSpatialGrid2D(0, 100), /positive finite/);
  assert.throws(() => new UniformSpatialGrid2D(100, -50), /positive finite/);
  assert.throws(() => new UniformSpatialGrid2D(NaN, 100), /positive finite/);

  const grid = new UniformSpatialGrid2D(210, 297, 20);
  assert.equal(grid.cols, Math.ceil(210 / 20));
  assert.equal(grid.rows, Math.ceil(297 / 20));
  assert.equal(grid.itemCount, 0);
});

test("UniformSpatialGrid2D inserts, queries box, and queries point correctly", () => {
  const grid = new UniformSpatialGrid2D<{ label: string }>(200, 200, 25);

  grid.insert({
    id: "item1",
    bounds: { minX: 10, minY: 10, maxX: 30, maxY: 40 },
    data: { label: "first" },
  });
  grid.insert({
    id: "item2",
    bounds: { minX: 80, minY: 80, maxX: 120, maxY: 120 },
    data: { label: "second" },
  });
  assert.equal(grid.itemCount, 2);

  // Point query inside item1
  const ptMatches1 = grid.queryPoint(20, 25);
  assert.equal(ptMatches1.length, 1);
  assert.equal(ptMatches1[0].id, "item1");

  // Point query outside all items
  const ptEmpty = grid.queryPoint(50, 50);
  assert.equal(ptEmpty.length, 0);

  // Point query outside grid
  assert.equal(grid.queryPoint(-5, 10).length, 0);
  assert.equal(grid.queryPoint(205, 10).length, 0);

  // Box query overlapping item1
  const boxMatches1 = grid.queryBox({ minX: 25, minY: 35, maxX: 60, maxY: 60 });
  assert.equal(boxMatches1.length, 1);
  assert.equal(boxMatches1[0].id, "item1");

  // Box query overlapping both items
  const boxMatchesBoth = grid.queryBox({ minX: 5, minY: 5, maxX: 150, maxY: 150 });
  assert.equal(boxMatchesBoth.length, 2);

  // Box query overlapping neither
  const boxMatchesNone = grid.queryBox({ minX: 45, minY: 45, maxX: 65, maxY: 65 });
  assert.equal(boxMatchesNone.length, 0);
});

test("UniformSpatialGrid2D hasCollision respects gapMm", () => {
  const grid = new UniformSpatialGrid2D<string>(200, 200, 20);
  grid.insert({
    id: "rect",
    bounds: { minX: 50, minY: 50, maxX: 70, maxY: 70 },
    data: "box",
  });

  // Candidate box at (75, 50) with width 20, height 20
  const candidate = { minX: 75, minY: 50, maxX: 95, maxY: 70 };

  // Disjoint with gap 2
  assert.equal(grid.hasCollision(candidate, 2), false);

  // Collides when gap is 6 (gap between 70 and 75 is 5)
  assert.equal(grid.hasCollision(candidate, 6), true);
});

test("UniformSpatialGrid2D removal, replacement, and clearing", () => {
  const grid = new UniformSpatialGrid2D<number>(100, 100, 10);
  grid.insert({ id: "a", bounds: { minX: 5, minY: 5, maxX: 15, maxY: 15 }, data: 1 });
  assert.equal(grid.itemCount, 1);
  assert.equal(grid.queryPoint(10, 10).length, 1);

  // Update position
  grid.insert({ id: "a", bounds: { minX: 40, minY: 40, maxX: 50, maxY: 50 }, data: 2 });
  assert.equal(grid.itemCount, 1);
  assert.equal(grid.queryPoint(10, 10).length, 0);
  assert.equal(grid.queryPoint(45, 45).length, 1);

  // Remove
  assert.equal(grid.remove("a"), true);
  assert.equal(grid.remove("nonexistent"), false);
  assert.equal(grid.itemCount, 0);
  assert.equal(grid.queryPoint(45, 45).length, 0);

  // Clear
  grid.insert({ id: "b", bounds: { minX: 1, minY: 1, maxX: 5, maxY: 5 }, data: 3 });
  grid.clear();
  assert.equal(grid.itemCount, 0);
});
