import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import { duplicatePrintDesign } from "./duplicateDesign.ts";
import type { PhotoAsset } from "./exportPdf.ts";
import {
  MAX_DESIGN_LAYERS, newFrameLayer, setFramePreset, validDesignLayers,
} from "./layers.ts";
import type { DesignLayer, FrameLayer, TextLayer } from "./layers.ts";
import { createProjectArchive, readProjectArchive } from "./projectArchive.ts";
import {
  createProjectSnapshot, deleteProject, loadProject, materializeProject, saveProject,
} from "./projectStore.ts";
import type { ProjectSettings } from "./projectStore.ts";
import { createProjectZipArchive, readProjectZipArchive } from "./projectZipArchive.ts";
import { registerPhotoBlob, releasePhotoBlobUrl } from "./photoBlobRegistry.ts";

const caption: TextLayer = {
  kind: "text", id: "caption", name: "Caption", visible: true,
  x: .1, y: .1, width: .8, height: .2, color: "#123456",
  groupId:"group-a",text: "Hello", fontSizePt: 12, bundledFontId: "pacifico", align: "center",
};

test("adding and replacing a frame preserves layer order and frame styling", () => {
  const added = setFramePreset([caption], "hairline");
  assert.equal(added.length, 2);
  assert.equal(added[0].kind, "frame");
  assert.equal(added[1], caption);
  const initial = added[0] as FrameLayer;
  assert.deepEqual([initial.x, initial.y, initial.width, initial.height], [0, 0, 1, 1]);
  assert.equal(validDesignLayers(added), true);

  const styled: FrameLayer = { ...initial, color: "#aabbcc", opacity: .6, weight: 2, visible: false };
  const switched = setFramePreset([caption, styled], "hearts");
  assert.equal(switched[0], caption);
  assert.deepEqual(switched[1], { ...styled, frameId: "hearts", visible: true });
  assert.equal(styled.frameId, "hairline");
  assert.equal(styled.visible, false);
});

test("a design has at most one valid, full-size frame and respects the layer limit", () => {
  const frame = newFrameLayer("hairline");
  assert.throws(() => newFrameLayer("missing"), /Unknown frame/);
  assert.throws(() => setFramePreset([], "missing"), /Unknown frame/);
  assert.equal(validDesignLayers([frame, { ...frame, id: "second-frame" }]), false);
  for (const patch of [
    { frameId: "unknown" }, { weight: 0 }, { weight: 2.6 }, { weight: NaN },{inset:NaN},{inset:.3},{spacing:.1},{spacing:Infinity},{groupId:"invalid-frame-group"},
    { x: .01 }, { y: .01 }, { width: .99 }, { height: .99 },
  ]) assert.equal(validDesignLayers([{ ...frame, ...patch }]), false);

  const full: DesignLayer[] = Array.from({ length: MAX_DESIGN_LAYERS }, (_, index) =>
    ({ ...caption, id: `caption-${index}` }));
  assert.throws(() => setFramePreset(full, "hairline"), /Remove a layer/);
  const withFrame = [frame, ...full.slice(1)];
  const replaced = setFramePreset(withFrame, "hearts");
  assert.equal(replaced.length, MAX_DESIGN_LAYERS);
  assert.equal(validDesignLayers(replaced), true);
  assert.equal(replaced[0].kind === "frame" && replaced[0].frameId, "hearts");
});

test("duplicated designs can change their frames independently", () => {
  const frame = { ...newFrameLayer("hairline"), color: "#112233", weight: 1.5,inset:.12,spacing:1.5 };
  const source: PhotoAsset = {
    id: "image", name: "image.png", url: "blob:source", pixelWidth: 1000, pixelHeight: 1000,
    crop: { x: 0, y: 0, width: 1, height: 1 }, widthMm: 50.8, heightMm: 50.8,
    quantity: 3, focalX: 50, focalY: 50, layers: [frame, caption],
  };
  const copy = duplicatePrintDesign(source, "copy", ["copy-frame", "copy-text"]);
  assert.equal(copy.url, source.url);
  assert.notEqual(copy.layers?.[0], source.layers?.[0]);
  copy.layers = setFramePreset(copy.layers!, "hearts");
  assert.equal(copy.layers[0].kind === "frame" && copy.layers[0].frameId, "hearts");
  assert.equal(source.layers![0].kind === "frame" && source.layers![0].frameId, "hairline");
  assert.equal(source.layers![0].id, frame.id);
  assert.equal(copy.layers[0].id, "copy-frame");
});

test("saved projects and portable archives round-trip frame and text layers", async () => {
  const blob = new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])],
    { type: "image/png" });
  const url = URL.createObjectURL(blob);
  registerPhotoBlob(url, blob);
  const frame = { ...newFrameLayer("hearts"), color: "#ce3344", opacity: .7, weight: 1.7,inset:.15,spacing:.75 };
  const layers: DesignLayer[] = [frame, caption];
  const asset: PhotoAsset = {
    id: "photo", name: "photo.png", url, pixelWidth: 800, pixelHeight: 800,
    crop: { x: 0, y: 0, width: 1, height: 1 }, widthMm: 50.8, heightMm: 50.8,
    quantity: 4, focalX: 50, focalY: 50, layers,
  };
  const settings: ProjectSettings = {
    paper: "A4", orientation: "portrait", customWidthMm: 210, customHeightMm: 297,
    marginMm: 5, gapMm: 3, cutGuides: true,
  };
  const id = `frame-project-${crypto.randomUUID()}`;
  let materializedUrl: string | undefined;
  try {
    const snapshot = await createProjectSnapshot(id, "Frame project", settings, [asset]);
    assert.equal(await saveProject(snapshot), true);
    const loaded = await loadProject(id);
    assert.deepEqual(loaded.assets[0].layers, layers);
    const [opened] = materializeProject(loaded);
    materializedUrl = opened.url;
    assert.deepEqual(opened.layers, layers);

    const zip = await createProjectZipArchive(loaded);
    const importedZip = await readProjectZipArchive(zip);
    assert.deepEqual(importedZip.assets[0].layers, layers);
    assert.deepEqual(new Uint8Array(await importedZip.assets[0].original.arrayBuffer()),
      new Uint8Array(await blob.arrayBuffer()));

    const json = await createProjectArchive(loaded);
    const importedJson = await readProjectArchive(json);
    assert.deepEqual(importedJson.assets[0].layers, layers);
  } finally {
    if (materializedUrl) releasePhotoBlobUrl(materializedUrl);
    releasePhotoBlobUrl(url);
    await deleteProject(id).catch(() => {});
  }
});
