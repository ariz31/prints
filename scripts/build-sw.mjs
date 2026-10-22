import { cacheFingerprint } from "./cache-fingerprint.mjs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const out = join(process.cwd(), "dist");
const html = await readFile(join(out, "index.html"), "utf8");
const template = await readFile(join(process.cwd(), "public", "sw.js"), "utf8");
// Precache *all* built chunks, including dynamic PDF export imports.
const assets = (await readdir(join(out, "assets")))
  .filter(name => /^[a-zA-Z0-9_.-]+\.(?:js|css)$/.test(name))
  .map(name => "/assets/" + name).sort();
if (assets.length === 0 || !assets.some((asset) => asset.endsWith(".js"))) {
  throw new Error("No hashed JavaScript asset found in built HTML; refusing incomplete offline cache.");
}
// Named SVG icons and the manifest do not carry content hashes. An update to
// these files must invalidate the old cache, even if Vite's chunks are unchanged.
// Read the list directly from the SW template to avoid a second source of truth.
const shellMatch=template.match(/const SHELL_FILES = (\\[[^;]+\\]);/);
if(!shellMatch)throw new Error("Offline shell asset declaration is missing.");
const entries=JSON.parse(shellMatch[1]);
const staticAssets={};
for(const entry of entries) {
  if(entry==="./"||entry==="./index.html")continue;
  if(typeof entry!=="string"||!/^\\.\\/[a-zA-Z0-9._/-]+$/.test(entry)||entry.includes(".."))
    throw new Error("Unsafe shell asset path: "+String(entry));
  staticAssets[entry]=await readFile(join(out,entry.slice(2)));
}
const version=cacheFingerprint({html,template,assets,staticAssets});
const output = template
  .replace("__CACHE_VERSION__", version)
  .replace("__PRECACHE_ASSETS__", JSON.stringify(assets));
if (output.includes("__CACHE_VERSION__") || output.includes("__PRECACHE_ASSETS__")) {
  throw new Error("Service worker template markers were not replaced.");
}
await writeFile(join(out, "sw.js"), output);
console.log("Prepared PRINTS offline cache", version, assets.length, "assets");
