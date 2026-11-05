import assert from "node:assert/strict";
import { test } from "node:test";
import { CanvasPool, type CanvasLike } from "./canvasPool.ts";

class MockCanvas implements CanvasLike {
  width: number;
  height: number;
  cleared = 0;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  getContext(_contextId: "2d"): OffscreenCanvasRenderingContext2D | null {
    return {
      clearRect: () => {
        this.cleared++;
      },
    } as unknown as OffscreenCanvasRenderingContext2D;
  }
}

test("CanvasPool acquires new instances and reuses released instances", () => {
  let createdCount = 0;
  const pool = new CanvasPool<MockCanvas>({
    maxCapacity: 2,
    factory: (w, h) => {
      createdCount++;
      return new MockCanvas(w, h);
    },
  });

  const c1 = pool.acquire(100, 100);
  assert.equal(createdCount, 1);
  assert.equal(c1.width, 100);
  assert.equal(c1.height, 100);

  pool.release(c1);
  assert.equal(pool.size, 1);

  // Next acquire of same size should reuse c1 and clear rect
  const c2 = pool.acquire(100, 100);
  assert.equal(createdCount, 1);
  assert.equal(c1, c2);
  assert.equal(c2.cleared, 1);
  assert.equal(pool.size, 0);

  // Next acquire of different size should reuse c1 and update dimensions
  pool.release(c2);
  const c3 = pool.acquire(200, 300);
  assert.equal(createdCount, 1);
  assert.equal(c3.width, 200);
  assert.equal(c3.height, 300);
});

test("CanvasPool discards excess canvases when exceeding maxCapacity", () => {
  const pool = new CanvasPool<MockCanvas>({
    maxCapacity: 2,
    factory: (w, h) => new MockCanvas(w, h),
  });

  const c1 = pool.acquire(50, 50);
  const c2 = pool.acquire(50, 50);
  const c3 = pool.acquire(50, 50);

  pool.release(c1);
  pool.release(c2);
  assert.equal(pool.size, 2);

  // c3 exceeds maxCapacity 2, so its dimensions must be zeroed immediately
  pool.release(c3);
  assert.equal(pool.size, 2);
  assert.equal(c3.width, 0);
  assert.equal(c3.height, 0);
});

test("CanvasPool clear and dispose zero out all pooled canvas dimensions", () => {
  const pool = new CanvasPool<MockCanvas>({
    maxCapacity: 3,
    factory: (w, h) => new MockCanvas(w, h),
  });

  const c1 = pool.acquire(10, 10);
  const c2 = pool.acquire(20, 20);
  pool.release(c1);
  pool.release(c2);
  assert.equal(pool.size, 2);

  pool.clear();
  assert.equal(pool.size, 0);
  assert.equal(c1.width, 0);
  assert.equal(c1.height, 0);
  assert.equal(c2.width, 0);
  assert.equal(c2.height, 0);

  const c3 = pool.acquire(30, 30);
  pool.release(c3);
  pool.dispose();
  assert.equal(pool.isDisposed, true);
  assert.equal(c3.width, 0);
  assert.equal(c3.height, 0);

  assert.throws(() => pool.acquire(10, 10), /disposed/);
});

test("CanvasPool withCanvas and withCanvasAsync handle automatic release on error", async () => {
  const pool = new CanvasPool<MockCanvas>({
    maxCapacity: 2,
    factory: (w, h) => new MockCanvas(w, h),
  });

  const result = pool.withCanvas(10, 10, canvas => {
    assert.equal(canvas.width, 10);
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(pool.size, 1);

  assert.throws(() => {
    pool.withCanvas(10, 10, () => {
      throw new Error("test failure");
    });
  }, /test failure/);
  // Canvas was released even after throw
  assert.equal(pool.size, 1);

  const asyncResult = await pool.withCanvasAsync(10, 10, async canvas => {
    assert.equal(canvas.width, 10);
    return "async-ok";
  });
  assert.equal(asyncResult, "async-ok");
  assert.equal(pool.size, 1);
});
