import assert from "node:assert/strict";
import test from "node:test";
import {photoPreviewSource,photoSourceFailureMode,canCommitPhotoEdit}
 from "./photoSourceRecovery.ts";

const photo={url:"blob:original",processedUrl:"blob:processed"};
test("prefer processed image until it fails, then offer preview-only original",()=>{
 assert.equal(photoPreviewSource(photo,"primary"),"blob:processed");
 const fallback=photoSourceFailureMode(photo,"blob:processed","primary");
 assert.equal(fallback,"original");
 assert.equal(photoPreviewSource(photo,fallback),"blob:original");
 assert.equal(canCommitPhotoEdit(fallback,false,true),false);
 assert.equal(photoSourceFailureMode(photo,"blob:original",fallback),"unavailable");
 assert.equal(photoPreviewSource(photo,"unavailable"),null);
});
test("source without processed image does not loop through fallback",()=>{
 const source={url:"blob:original"};
 assert.equal(photoPreviewSource(source,"primary"),"blob:original");
 assert.equal(photoSourceFailureMode(source,"blob:original","primary"),"unavailable");
 assert.equal(photoSourceFailureMode({...source,processedUrl:"blob:original"},
  "blob:original","primary"),"unavailable");
});
test("a failed raster preview must block applying misleading adjustments",()=>{
 assert.equal(canCommitPhotoEdit("primary",false,true),true);
 assert.equal(canCommitPhotoEdit("primary",false,false),false);
 assert.equal(canCommitPhotoEdit("primary",true,true),false);
 assert.equal(canCommitPhotoEdit("original",false,true),false);
 assert.equal(canCommitPhotoEdit("original",true,true),false);
 assert.equal(canCommitPhotoEdit("unavailable",false,true),false);
});
