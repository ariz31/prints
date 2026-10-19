import assert from "node:assert/strict";
import test from "node:test";
import { createProjectArchive, readProjectArchive } from "./projectArchive.ts";
import type { StoredProject } from "./projectStore.ts";

const project: StoredProject = {
  schemaVersion: 1, id: "old-id", name: "Business cards", updatedAt: "2026-10-19T00:00:00Z",
  settings: { paper: "A4", orientation: "portrait", customWidthMm: 210, customHeightMm: 297,
    marginMm: 5, gapMm: 2, cutGuides: true },
  assets: [{
    id: "image-a", name: "photo.png", widthMm: 50.8, heightMm: 50.8,
    pixelWidth: 800, pixelHeight: 800, quantity: 12, focalX: 50, focalY: 50,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    original: new Blob([Uint8Array.from([137,80,78,71,1,2,3])], { type: "image/png" }),
    processed: new Blob([Uint8Array.from([137,80,78,71,3,2,1])], { type: "image/png" }),
    layers: [{ kind:"text", id:"l1", name:"name", visible:true, x:.1, y:.1, width:.6,
      height:.2, color:"#123456", text:"HELLO", fontSizePt:10 }],
  }],
};
test("portable archive restores original + processed image, crop, layers, paper and copies", async () => {
  const archive = await createProjectArchive(project);
  const restored = await readProjectArchive(archive);
  assert.notEqual(restored.id, project.id);
  assert.equal(restored.name, "Business cards (imported)");
  assert.deepEqual(restored.settings, project.settings);
  assert.equal(restored.assets[0].quantity, 12);
  assert.deepEqual(restored.assets[0].crop, project.assets[0].crop);
  assert.deepEqual(restored.assets[0].layers, project.assets[0].layers);
  assert.deepEqual(new Uint8Array(await restored.assets[0].processed!.arrayBuffer()),
    new Uint8Array(await project.assets[0].processed!.arrayBuffer()));
  assert.deepEqual(new Uint8Array(await restored.assets[0].original.arrayBuffer()),
    new Uint8Array(await project.assets[0].original.arrayBuffer()));
});
test("invalid or unsupported file is rejected", async () => {
  await assert.rejects(readProjectArchive(new Blob(["not JSON"])), /not a valid/);
  await assert.rejects(readProjectArchive(new Blob([JSON.stringify({
    format:"PRINTS_PROJECT", schemaVersion: 9, project: {},
  })])), /version/);
});
test("invalid imported crop, duplicate ids, and malicious MIME types are rejected", async () => {
  const archive = JSON.parse(await (await createProjectArchive(project)).text());
  archive.project.assets[0].crop.width = 1.5;
  await assert.rejects(readProjectArchive(new Blob([JSON.stringify(archive)])), /Invalid or duplicated/);
  archive.project.assets[0].crop.width = 1;
  archive.project.assets.push(archive.project.assets[0]);
  await assert.rejects(readProjectArchive(new Blob([JSON.stringify(archive)])), /Invalid or duplicated/);
  archive.project.assets.pop();
  archive.project.assets[0].original.mime = "image/svg+xml";
  await assert.rejects(readProjectArchive(new Blob([JSON.stringify(archive)])), /unsupported or oversized/);
});
test("export rejects unsafe source image metadata or media", async () => {
  await assert.rejects(createProjectArchive({
    ...project, assets: [{ ...project.assets[0], quantity: -3 }],
  }), /Invalid project asset/);
  await assert.rejects(createProjectArchive({
    ...project, assets: [{ ...project.assets[0], original: new Blob(["svg"], {type:"image/svg+xml"}) }],
  }), /unsupported or oversized/);
});
