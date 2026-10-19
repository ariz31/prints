import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const out = join(process.cwd(), "dist");
const html = await readFile(join(out, "index.html"), "utf8");
const template = await readFile(join(process.cwd(), "public", "sw.js"), "utf8");
const assets = [...new Set(
  [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)]
    .map((match) => match[1]),
)];
if (assets.length === 0 || !assets.some((asset) => asset.endsWith(".js"))) {
  throw new Error("No hashed JavaScript asset found in built HTML; refusing incomplete offline cache.");
}
const version = createHash("sha256").update(html).digest("hex").slice(0, 16);
const output = template
  .replace("__CACHE_VERSION__", version)
  .replace("__PRECACHE_ASSETS__", JSON.stringify(assets));
if (output.includes("__CACHE_VERSION__") || output.includes("__PRECACHE_ASSETS__")) {
  throw new Error("Service worker template markers were not replaced.");
}
await writeFile(join(out, "sw.js"), output);
console.log("Prepared PRINTS offline cache", version, assets.length, "assets");
