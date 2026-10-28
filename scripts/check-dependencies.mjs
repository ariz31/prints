import {readFile} from "node:fs/promises";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
const pkg=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
const lock=JSON.parse(await readFile(new URL("../package-lock.json",import.meta.url),"utf8"));
assert.equal(lock.lockfileVersion,3,"Use the committed npm v3 lockfile.");
assert.equal(lock.name,pkg.name);assert.equal(lock.version,pkg.version);
assert.deepEqual(lock.packages[""].engines??{},pkg.engines??{},"Runtime engine manifest/lock drift.");
for(const field of ["dependencies","devDependencies","optionalDependencies"])
 assert.deepEqual(lock.packages[""][field]??{},pkg[field]??{},"Dependency manifest/lock drift: "+field);
for(const [path,entry] of Object.entries(lock.packages)){
 if(!path||entry.link)continue;
 assert.ok(entry.version&&entry.integrity&&/^sha(256|384|512)-/.test(entry.integrity),"Missing registry version/integrity: "+path);
 assert.ok(entry.resolved?.startsWith("https://registry.npmjs.org/"),"Unexpected dependency source: "+path);
}
const lockBytes=await readFile(new URL("../package-lock.json",import.meta.url));
const lockSha=createHash("sha256").update(lockBytes).digest("hex");
console.log("Dependency lock verified:",Object.keys(lock.packages).length-1,"packages; npm",pkg.packageManager,
  "; node",pkg.engines?.node??"unspecified","; sha256",lockSha);
