import assert from "node:assert/strict";
import test from "node:test";
import {readPhotoBlob,registerPhotoBlob,releasePhotoBlobUrl} from "./photoBlobRegistry.ts";

test("registered source Blob survives independently of fetch",async()=>{
 const source=new Blob(["original"],{type:"image/png"});
 const url=URL.createObjectURL(source);
 registerPhotoBlob(url,source);
 const savedFetch=globalThis.fetch;
 globalThis.fetch=(()=>{throw new Error("unexpected fetch");}) as typeof fetch;
 try{assert.equal(await readPhotoBlob(url),source);}
 finally{globalThis.fetch=savedFetch;releasePhotoBlobUrl(url);}
});
test("reject external sources from the local registry",()=>{
 assert.throws(()=>registerPhotoBlob("https://example.com/image",new Blob()),/local photo/);
});
test("expired unregistered source has actionable failure",async()=>{
 const url=URL.createObjectURL(new Blob(["image"]));
 releasePhotoBlobUrl(url);
 await assert.rejects(readPhotoBlob(url),/Reimport the affected image/);
});
