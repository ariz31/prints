import test from "node:test";
import assert from "node:assert/strict";
import { resolvePreviewImageSelection } from "./previewImageSelection.ts";
import type { SheetPage } from "../../../domain/models/sheet.ts";
import type { PhotoAsset } from "../../../domain/models/asset.ts";

const page: SheetPage = {
  placements: [
    { itemId: "a", copyIndex: 0, xMm: 0, yMm: 0, widthMm: 90, heightMm: 50 },
    { itemId: "a", copyIndex: 1, xMm: 92, yMm: 0, widthMm: 90, heightMm: 50 },
    { itemId: "b", copyIndex: 0, xMm: 0, yMm: 52, widthMm: 90, heightMm: 50 },
  ],
};
const assets = [
  { id: "a", name: "Card design", widthMm: 210, heightMm: 297 },
  { id: "b", name: "Another design", widthMm: 210, heightMm: 297 },
] as PhotoAsset[];

test("resolves a specific copy but edits the original design", () => {
  const result = resolvePreviewImageSelection({ pageIndex: 0, itemId: "a", copyIndex: 1 }, 0, page, assets);
  assert.equal(result?.asset, assets[0]);
  assert.equal(result?.placement, page.placements[1]);
  assert.equal(result?.placement.widthMm, 90);
  assert.equal(result?.asset.widthMm, 210);
});

test("does not show a stale selection after changing pages", () => {
  assert.equal(resolvePreviewImageSelection({ pageIndex: 0, itemId: "a", copyIndex: 0 }, 1, page, assets), null);
});

test("does not display settings for deleted or absent placements", () => {
  assert.equal(resolvePreviewImageSelection({ pageIndex: 0, itemId: "missing", copyIndex: 0 }, 0, page, assets), null);
  assert.equal(resolvePreviewImageSelection({ pageIndex: 0, itemId: "a", copyIndex: 0 }, 0, page, []), null);
  assert.equal(resolvePreviewImageSelection(null, 0, page, assets), null);
  assert.equal(resolvePreviewImageSelection({ pageIndex: 0, itemId: "a", copyIndex: 0 }, 0, undefined, assets), null);
});

test("identifies independent sources in a mixed-image sheet", () => {
  const result = resolvePreviewImageSelection({ pageIndex: 0, itemId: "b", copyIndex: 0 }, 0, page, assets);
  assert.equal(result?.asset.id, "b");
  assert.equal(result?.placement.itemId, "b");
});
