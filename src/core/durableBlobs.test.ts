import test from "node:test";
import assert from "node:assert/strict";
import {copyBlobBytes,copyProjectBlobBytes,isInvalidBlobFailure} from "./durableBlobs.ts";
import type {StoredProject} from "./projectStore.ts";

test("imported provider Blob bytes become an independent, durable Blob",async()=>{
  const source=new Blob([new Uint8Array([0,1,2,7,255])],{type:"image/png"});
  const copy=await copyBlobBytes(source);
  assert.notStrictEqual(copy,source);
  assert.equal(copy.size,source.size);
  assert.equal(copy.type,"image/png");
  assert.deepEqual(new Uint8Array(await copy.arrayBuffer()),
    new Uint8Array(await source.arrayBuffer()));
});
test("empty or unreadable photo bytes cannot masquerade as a saved image",async()=>{
  await assert.rejects(copyBlobBytes(new Blob([])),/missing/);
  const source=new Blob(["valid"]);
  source.arrayBuffer=async()=>new ArrayBuffer(1);
  await assert.rejects(copyBlobBytes(source),/changed during import/);
});
test("InvalidBlob detection is narrow and never retries quota or conflict errors",()=>{
  assert.equal(isInvalidBlobFailure(new Error("Failed to write blobs (InvalidBlob)")),true);
  assert.equal(isInvalidBlobFailure(new DOMException("Invalid blob","UnknownError")),true);
  assert.equal(isInvalidBlobFailure(new Error("QuotaExceededError")),false);
  assert.equal(isInvalidBlobFailure(new Error("Project revision conflict")),false);
});
test("recovery repair preserves metadata, revision, and deduplicated source bytes",async()=>{
  const blob=new Blob(["image"],{type:"image/webp"});
  const settings={paper:"A4",orientation:"portrait",customWidthMm:210,customHeightMm:297,
    marginMm:5,gapMm:2,cutGuides:false};
  const first={id:"a",name:"photo.webp",pixelWidth:800,pixelHeight:800,
    widthMm:50.8,heightMm:50.8,quantity:1,focalX:50,focalY:50,
    crop:{x:0,y:0,width:1,height:1},original:blob};
  const project={schemaVersion:1,id:"project",name:"Draft",updatedAt:"2026-10-28T00:00:00.000Z",
    revisionToken:"revision-1",settings,assets:[first,{...first,id:"b",processed:blob}]} as unknown as StoredProject;
  const copy=await copyProjectBlobBytes(project);
  assert.notStrictEqual(copy,project);
  assert.equal(copy.revisionToken,"revision-1");
  assert.strictEqual(copy.settings,settings);
  assert.notStrictEqual(copy.assets[0].original,blob);
  assert.strictEqual(copy.assets[0].original,copy.assets[1].original);
  assert.strictEqual(copy.assets[1].processed,copy.assets[0].original);
  assert.equal(await copy.assets[0].original.text(),"image");
});
