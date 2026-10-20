import assert from "node:assert/strict";
import {readFile,readdir,stat} from "node:fs/promises";
import {join} from "node:path";

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
