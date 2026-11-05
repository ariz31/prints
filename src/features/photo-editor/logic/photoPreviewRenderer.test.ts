import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PhotoPreviewRenderer,
  isPreviewWorkerReply,
  type PreviewRenderRequest,
  type LegacyPreviewRenderRequest,
  type PreviewWorkerJob,
  type PreviewWorkerReply,
} from "./photoPreviewRenderer.ts";
import { DEFAULT_ADJUSTMENTS } from "./photoAdjustments.ts";
import type { PhotoAsset } from "../../../core/exportPdf.ts";

class FakeWorker {
  static last: FakeWorker;
  onmessage: ((event: MessageEvent<PreviewWorkerReply>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly posted: PreviewWorkerJob[] = [];
  terminated = false;
  constructor() {
    FakeWorker.last = this;
  }
  postMessage(message: PreviewWorkerJob) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  finish(id: number, bitmap?: ImageBitmap) {
    const data: PreviewWorkerReply = bitmap
      ? { id, ok: true, format: "bitmap", bitmap, width: 100, height: 100 }
      : { id, ok: true, blob: new Blob(["local"]) };
    this.onmessage?.({ data } as MessageEvent<PreviewWorkerReply>);
  }
  renderJob(index: number): PreviewRenderRequest | LegacyPreviewRenderRequest {
    const job = this.posted[index];
    if (!job || job.type === "cancel") throw new Error("Expected render job");
    return job;
  }
}

function mock(name: string, value: unknown) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  return () => {
    if (original) Object.defineProperty(globalThis, name, original);
    else Reflect.deleteProperty(globalThis, name);
  };
}

const asset = {
  url: "blob:local-photo",
  pixelWidth: 100,
  pixelHeight: 100,
  widthMm: 25.4,
  heightMm: 25.4,
  crop: { x: 0, y: 0, width: 1, height: 1 },
} as PhotoAsset;

test("photo preview queue discards superseded work and preserves the latest", async () => {
  const restoreWorker = mock("Worker", FakeWorker);
  const restoreCanvas = mock("OffscreenCanvas", class {});
  const restoreBitmap = mock("createImageBitmap", () => {});
  let renderer: PhotoPreviewRenderer | undefined;
  try {
    renderer = new PhotoPreviewRenderer();
    assert.equal(renderer.usesWorker, true);
    const first = renderer.render(asset, DEFAULT_ADJUSTMENTS, "full", "interactive");
    const superseded = renderer.render(asset, DEFAULT_ADJUSTMENTS, "full", "interactive");
    const last = renderer.render(asset, DEFAULT_ADJUSTMENTS, "full", "final");
    await assert.rejects(superseded, /superseded/);
    const fake = FakeWorker.last;
    assert.equal(fake.posted.length, 1);
    assert.equal(fake.renderJob(0).asset.url, "blob:local-photo");
    fake.finish(fake.posted[0].id);
    await first;
    assert.equal(fake.posted.length, 2);
    assert.equal(fake.renderJob(1).quality, "final");
    fake.finish(fake.posted[1].id);
    await last;
    renderer.dispose();
    assert.equal(fake.terminated, true);
    await assert.rejects(renderer.render(asset, DEFAULT_ADJUSTMENTS, "full"), /disposed/);
  } finally {
    renderer?.dispose();
    restoreBitmap();
    restoreCanvas();
    restoreWorker();
  }
});

test("disposing an editor cancels active and queued preview promises", async () => {
  const restoreWorker = mock("Worker", FakeWorker);
  const restoreCanvas = mock("OffscreenCanvas", class {});
  const restoreBitmap = mock("createImageBitmap", () => {});
  try {
    const renderer = new PhotoPreviewRenderer();
    const active = renderer.render(asset, DEFAULT_ADJUSTMENTS, "crop");
    const queued = renderer.render(asset, DEFAULT_ADJUSTMENTS, "crop");
    renderer.dispose();
    await assert.rejects(active, /canceled/);
    await assert.rejects(queued, /canceled/);
    assert.equal(FakeWorker.last.terminated, true);
  } finally {
    restoreBitmap();
    restoreCanvas();
    restoreWorker();
  }
});

test("exact ID and Crop rasters use the worker with latest-only geometry", async () => {
  const restoreWorker = mock("Worker", FakeWorker);
  const restoreCanvas = mock("OffscreenCanvas", class {});
  const restoreBitmap = mock("createImageBitmap", () => {});
  let renderer: PhotoPreviewRenderer | undefined;
  try {
    renderer = new PhotoPreviewRenderer();
    const first = renderer.render(asset, DEFAULT_ADJUSTMENTS, "crop", "final");
    const nextAsset = { ...asset, crop: { x: 0.1, y: 0, width: 0.9, height: 1 } };
    const superseded = renderer.render(nextAsset, DEFAULT_ADJUSTMENTS, "crop", "final");
    const lastAsset = { ...asset, crop: { x: 0.2, y: 0, width: 0.8, height: 1 } };
    const last = renderer.render(lastAsset, DEFAULT_ADJUSTMENTS, "crop", "final");
    await assert.rejects(superseded, /superseded/);
    const worker = FakeWorker.last;
    assert.equal(worker.posted.length, 1);
    assert.equal(worker.renderJob(0).mode, "crop");
    assert.equal(worker.renderJob(0).quality, "final");
    worker.finish(worker.posted[0].id);
    await first;
    assert.equal(worker.posted.length, 2);
    assert.deepEqual(worker.renderJob(1).asset.crop, lastAsset.crop);
    worker.finish(worker.posted[1].id);
    await last;
  } finally {
    renderer?.dispose();
    restoreBitmap();
    restoreCanvas();
    restoreWorker();
  }
});

test("AbortController aborts in-flight worker job and immediately dispatches pending jobs", async () => {
  const restoreWorker = mock("Worker", FakeWorker);
  const restoreCanvas = mock("OffscreenCanvas", class {});
  const restoreBitmap = mock("createImageBitmap", () => {});
  let renderer: PhotoPreviewRenderer | undefined;
  try {
    renderer = new PhotoPreviewRenderer();
    const controller = new AbortController();

    const activePromise = renderer.render(asset, DEFAULT_ADJUSTMENTS, "full", "interactive", controller.signal);
    const pendingPromise = renderer.render(asset, DEFAULT_ADJUSTMENTS, "full", "final");

    const worker = FakeWorker.last;
    assert.equal(worker.posted.length, 1);
    const activeId = worker.posted[0].id;

    // Abort the active job
    controller.abort();
    await assert.rejects(activePromise, (err: unknown) => {
      return err instanceof DOMException && err.name === "AbortError";
    });

    // Check that cancel message was posted to worker
    assert.equal(worker.posted.length, 3);
    assert.deepEqual(worker.posted[1], { type: "cancel", id: activeId });

    // Check that pending job was immediately dispatched
    assert.equal(worker.renderJob(2).quality, "final");
    worker.finish(worker.posted[2].id);
    await pendingPromise;
  } finally {
    renderer?.dispose();
    restoreBitmap();
    restoreCanvas();
    restoreWorker();
  }
});

test("renderBitmap transfers ImageBitmap and closes superseded bitmaps", async () => {
  let closed = false;
  const mockBitmap = {
    width: 100,
    height: 100,
    close: () => {
      closed = true;
    },
  } as unknown as ImageBitmap;

  const restoreWorker = mock("Worker", FakeWorker);
  const restoreCanvas = mock("OffscreenCanvas", class {});
  const restoreBitmap = mock("createImageBitmap", () => {});
  let renderer: PhotoPreviewRenderer | undefined;
  try {
    renderer = new PhotoPreviewRenderer();
    const bitmapPromise = renderer.renderBitmap(asset, DEFAULT_ADJUSTMENTS, "crop", "interactive");
    const worker = FakeWorker.last;
    assert.equal(worker.posted.length, 1);
    assert.equal(worker.renderJob(0).format, "bitmap");

    worker.finish(worker.posted[0].id, mockBitmap);
    const result = await bitmapPromise;
    assert.equal(result, mockBitmap);
    assert.equal(closed, false);

    // If an unexpected or obsolete reply arrives, bitmap is closed to prevent GPU leak
    worker.finish(99999, mockBitmap);
    assert.equal(closed, true);
  } finally {
    renderer?.dispose();
    restoreBitmap();
    restoreCanvas();
    restoreWorker();
  }
});

test("isPreviewWorkerReply type guard strictly validates reply shapes", () => {
  assert.equal(isPreviewWorkerReply(null), false);
  assert.equal(isPreviewWorkerReply(undefined), false);
  assert.equal(isPreviewWorkerReply("string"), false);
  assert.equal(isPreviewWorkerReply({ id: "invalid", ok: true }), false);
  assert.equal(isPreviewWorkerReply({ id: 1 }), false);

  // Failure reply
  assert.equal(isPreviewWorkerReply({ id: 1, ok: false, error: "failed" }), true);
  assert.equal(isPreviewWorkerReply({ id: 1, ok: false, error: 123 }), false);

  // Blob reply
  assert.equal(isPreviewWorkerReply({ id: 1, ok: true, blob: new Blob(["test"]) }), true);
  assert.equal(isPreviewWorkerReply({ id: 1, ok: true, blob: null }), false);

  // Bitmap reply
  assert.equal(isPreviewWorkerReply({ id: 1, ok: true, bitmap: {} }), true);
});
