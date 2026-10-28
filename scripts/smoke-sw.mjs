import assert from "node:assert/strict";
import {readFile,readdir,stat} from "node:fs/promises";
import {join} from "node:path";
import {runInNewContext} from "node:vm";
import {cacheFingerprint} from "./cache-fingerprint.mjs";

const folder="dist";
const sw=await readFile(join(folder,"sw.js"),"utf8");
const chunks=(await readdir(join(folder,"assets")))
  .filter(name=>/\.(?:js|css)$/.test(name)).map(name=>"/assets/"+name);
for(const file of chunks){
  assert.ok(sw.includes(JSON.stringify(file)),"Missing offline chunk "+file);
  assert.ok((await stat(join(folder,file.slice(1)))).size>0);
}
assert.ok(chunks.length>=4,"PDF export code should be lazy-loaded and precached");
assert.match(sw,/old\.slice\(0,-1\)/,"Previous app revision must be retained");
assert.match(sw,/const hashedAsset=/,"Older immutable chunks must be recoverable");
assert.match(sw,/const current = await cache\.match\(request\);/,
  "Current release assets must take precedence over older caches");
assert.ok(!sw.includes("cache.put(SHELL_URL, response.clone())"),
  "Online navigation must not overwrite versioned offline HTML");
assert.match(sw,/caches\.open\(CACHE\)\)\.match\(SHELL_URL\)/,
  "Offline navigation must choose the current worker's shell");
assert.ok(!sw.includes("__PRECACHE_ASSETS__"));
console.log("Offline version-integrity smoke passed:",chunks.length,"precached chunks");


// Brand and manifest changes must invalidate the versioned cache even when
// index.html and all hashed Vite chunks remain byte-identical.
const html=await readFile(join(folder,"index.html"),"utf8");
const template=await readFile("public/sw.js","utf8");
const matched=template.match(/const SHELL_FILES = (\[[^;]+\]);/);
assert.ok(matched,"Static offline asset list must be parseable.");
const entries=JSON.parse(matched[1]);
for(const required of [
  "./icon.svg","./icon-maskable.svg","./mark.svg",
  "./wordmark.svg","./wordmark-reverse.svg","./symbol.svg",
  "./manifest.webmanifest"
])assert.ok(entries.includes(required),"Missing offline brand resource: "+required);
const staticAssets={};
for(const entry of entries){
  if(entry==="./"||entry==="./index.html")continue;
  staticAssets[entry]=await readFile(join(folder,entry.slice(2)));
}
const payload={html,template,assets:chunks,staticAssets};
const version=cacheFingerprint(payload);
assert.ok(sw.includes('const CACHE = "prints-shell-'+version+'"'),
  "Cache version must fingerprint deployed static assets.");
const changed={...staticAssets};
const first="./wordmark.svg",bytes=Buffer.from(changed[first]);
bytes[bytes.length-1]^=1;changed[first]=bytes;
assert.notEqual(cacheFingerprint({...payload,staticAssets:changed}),version,
  "A wordmark-only update must not reuse an older app-shell cache.");
const changedFont={...staticAssets};
const font="./fonts/Pacifico-Regular-27765d02ac13.ttf", fontBytes=Buffer.from(changedFont[font]);
fontBytes[fontBytes.length-1]^=1;changedFont[font]=fontBytes;
assert.notEqual(cacheFingerprint({...payload,staticAssets:changedFont}),version,
  "A bundled font update must not reuse an older app-shell cache.");
// A newly activated worker must let older tabs read their own immutable fonts
// from the previous revision when offline, just like old hashed JS chunks.
const handlers={};
const oldFontResponse={marker:"old font from retained cache"};
const workerSelf={registration:{scope:"https://prints.test/"},location:{origin:"https://prints.test"},
  addEventListener:(name,handler)=>{handlers[name]=handler;}};
runInNewContext(sw,{self:workerSelf,URL,
  caches:{open:async()=>({match:async()=>undefined}),match:async()=>oldFontResponse},
  fetch:async()=>{throw new Error("Offline");}});
let oldResponse;
handlers.fetch({request:{method:"GET",url:"https://prints.test/fonts/Lato-Regular-deadbeefdead.ttf",mode:"cors"},
  respondWith:promise=>{oldResponse=promise;}});
assert.ok(oldResponse,"The worker must handle versioned fonts used by older tabs");
assert.equal(await oldResponse,oldFontResponse,"Offline old tabs must receive the retained font bytes");
console.log("Brand-aware offline cache regression passed:",Object.keys(staticAssets).length,"static resources");
