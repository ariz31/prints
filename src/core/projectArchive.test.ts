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
  archive.images[archive.project.assets[0].originalRef].mime = "image/svg+xml";
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

test("portable project preserves nondestructive adjustments and rejects invalid data",async()=>{
 const adjusted={...project,assets:[{...project.assets[0],
   adjustments:{brightness:18,contrast:4,saturation:-22}}]};
 const blob=await createProjectArchive(adjusted);
 const restored=await readProjectArchive(blob);
 assert.deepEqual(restored.assets[0].adjustments,
   {brightness:18,contrast:4,saturation:-22});
 const invalid=JSON.parse(await blob.text());
 invalid.project.assets[0].adjustments.brightness=Infinity;
 // JSON.stringify converts nonfinite values into null; validation must reject them.
 await assert.rejects(readProjectArchive(new Blob([JSON.stringify(invalid)])),/Invalid or duplicated/);
});

test("V2 archive deduplicates shared originals across independent design variants",async()=>{
  const base=project.assets[0];
  const assetTwo={...base,id:"variant-2",name:"1x1 variant",
    widthMm:25.4,heightMm:25.4,quantity:16,processed:undefined,
    original:new Blob([await base.original.arrayBuffer()],{type:base.original.type})};
  const assetThree={...base,id:"variant-3",name:"2x2 variant",
    quantity:24,processed:undefined};
  const variantProject={...project,settings:{...project.settings,manualPlacements:[
    {itemId:"variant-2",copyIndex:0,pageIndex:0,xMm:60,yMm:5},
  ]},assets:[base,assetTwo,assetThree]};
  const archive=await createProjectArchive(variantProject);
  const document=JSON.parse(await archive.text());
  assert.equal(document.schemaVersion,2);
  assert.equal(document.project.assets.length,3);
  assert.equal(document.images.length,2); // shared original, one processed PNG
  assert.equal(document.project.assets[0].originalRef,document.project.assets[1].originalRef);
  assert.equal(document.project.assets[1].originalRef,document.project.assets[2].originalRef);
  const imported=await readProjectArchive(archive);
  assert.equal(imported.assets.length,3);
  assert.equal(imported.assets[1].widthMm,25.4);
  assert.equal(imported.assets[2].quantity,24);
  assert.equal(imported.assets[0].original,imported.assets[1].original);
  assert.deepEqual(imported.settings.manualPlacements,variantProject.settings.manualPlacements);
});
test("legacy V1 portable files can still be imported",async()=>{
  const current=JSON.parse(await (await createProjectArchive(project)).text());
  const image=current.images;
  const legacy={format:"PRINTS_PROJECT",schemaVersion:1,project:{
    ...current.project,assets:current.project.assets.map(
      ({originalRef,processedRef,...meta}:{
        originalRef:number;processedRef?:number;[key:string]:unknown;
      })=>({...meta,
        original:{mime:image[originalRef].mime,data:image[originalRef].data},
        ...(processedRef===undefined?{}:{
          processed:{mime:image[processedRef].mime,data:image[processedRef].data},
        }),
      })),
  }};
  const restored=await readProjectArchive(new Blob([JSON.stringify(legacy)]));
  assert.equal(restored.assets[0].name,"photo.png");
  assert.ok(restored.assets[0].processed);
  assert.equal(restored.id===project.id,false);
});
test("V2 import rejects corrupted image content and invalid reference indices",async()=>{
  const baseline=await createProjectArchive(project);
  const checksum=JSON.parse(await baseline.text());
  checksum.images[0].data=checksum.images[0].data.replace(/^./,"B");
  await assert.rejects(readProjectArchive(new Blob([JSON.stringify(checksum)])),/integrity check/);
  const badRef=JSON.parse(await baseline.text());
  badRef.project.assets[0].originalRef=900;
  await assert.rejects(readProjectArchive(new Blob([JSON.stringify(badRef)])),/reference is invalid/);
});

test("portable archive cannot import unsafe pixel dimensions or physical sizes",async()=>{
  const raw=JSON.parse(await (await createProjectArchive(project)).text());
  for(const patch of [
    {pixelWidth:20000},
    {pixelWidth:10000,pixelHeight:10000},
    {widthMm:2500},
    {processedWidth:1000}, // paired dimensions are required
    {processedWidth:10000,processedHeight:10000},
  ]){
    const copy=structuredClone(raw);
    Object.assign(copy.project.assets[0],patch);
    await assert.rejects(readProjectArchive(new Blob([JSON.stringify(copy)])),
      /Invalid or duplicated/);
    await assert.rejects(createProjectArchive({
      ...project,assets:[{...project.assets[0],...patch}],
    } as StoredProject),/Invalid project asset/);
  }
});


test("advanced photo local masks and solid background survive portable project roundtrip",async()=>{
 const adjustments={brightness:5,contrast:3,saturation:4,exposure:18,
  regions:[{kind:"light" as const,x:.43,y:.62,radius:.12,strength:70}],
  backgroundColor:"#f4f6f8"};
 const withRetouch={...project,assets:[{...project.assets[0],adjustments}]};
 const blob=await createProjectArchive(withRetouch);
 const restored=await readProjectArchive(blob);
 assert.deepEqual(restored.assets[0].adjustments,adjustments);
 const injected=JSON.parse(await blob.text());
 injected.project.assets[0].adjustments.regions[0].radius=999;
 await assert.rejects(readProjectArchive(new Blob([JSON.stringify(injected)])),/Invalid or duplicated/);
});
