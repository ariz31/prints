import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const dist = resolve(process.cwd(), "dist");
const html = await readFile(join(dist, "index.html"), "utf8");
const sw = await readFile(join(dist, "sw.js"), "utf8");
if (sw.includes("__CACHE_VERSION__") || sw.includes("__PRECACHE_ASSETS__")) {
  throw new Error("Uncompiled service worker was included in the output.");
}
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)]
  .map((match) => match[1]);
if (!assets.some((p) => p.endsWith(".js"))) {
  throw new Error("No application JavaScript was found in Vercel output.");
}
for (const asset of assets) {
  const path = resolve(dist, "." + asset);
  if (!path.startsWith(dist + "/")) throw new Error("Unsafe dist asset path.");
  if ((await stat(path)).size === 0) throw new Error("Empty build asset: " + asset);
  if (!sw.includes(JSON.stringify(asset))) {
    throw new Error("Offline cache is missing required build asset: " + asset);
  }
}
const config = JSON.parse(await readFile("vercel.json", "utf8"));
if (config.framework !== "vite" || config.outputDirectory !== "dist" ||
    config.buildCommand !== "npm run build") {
  throw new Error("Vercel settings are not aligned with the application build.");
}
console.log("Vercel build verified:", assets.length, "hashed assets precached");
