import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

// Enforce the patched Vite 6 line even if a machine accidentally reuses
// an outdated node_modules tree without reinstalling package.json.
const installedVite=JSON.parse(await readFile("node_modules/vite/package.json","utf8"));
const [major,minor,patch]=installedVite.version.split(".").map(Number);
if(major!==6||minor<4||(minor===4&&patch<5))
  throw new Error("Vite 6.4.5 or newer in the Vite 6 line is required by the security baseline.");
const dist = resolve(process.cwd(), "dist");
const html = await readFile(join(dist, "index.html"), "utf8");
const sw = await readFile(join(dist, "sw.js"), "utf8");
if (sw.includes("__CACHE_VERSION__") || sw.includes("__PRECACHE_ASSETS__")) {
  throw new Error("Uncompiled service worker was included in the output.");
}
const assets=(await readdir(join(dist,"assets")))
  .filter(name=>/^[a-zA-Z0-9_.-]+\.(?:js|css)$/.test(name))
  .map(name=>"/assets/"+name);
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
const shellMatch=sw.match(/const SHELL_FILES = (\[[^;]+\]);/);
if(!shellMatch)throw new Error("Offline service worker shell list is missing.");
const shellFiles=JSON.parse(shellMatch[1]);
if(!Array.isArray(shellFiles)||!shellFiles.includes("./mark.svg")||
  !shellFiles.includes("./wordmark.svg")||!shellFiles.includes("./manifest.webmanifest"))
  throw new Error("Required PRINTS offline shell assets are missing.");
if(!sw.includes("[...SHELL_FILES, ...PRECACHE].some("))
  throw new Error("Offline fetch handler does not serve all precached shell assets.");
if(sw.includes("cache.put(SHELL_URL, response.clone())"))
  throw new Error("Offline HTML must stay pinned to its matching hashed assets.");
for(const entry of shellFiles){
  if(typeof entry!=="string"||!entry.startsWith("./"))throw new Error("Unsafe offline shell resource.");
  const path=entry==="./"?join(dist,"index.html"):resolve(dist,entry);
  if(!path.startsWith(dist+"/"))throw new Error("Offline shell path escapes deployment.");
  if((await stat(path)).size===0)throw new Error("Empty offline shell asset: "+entry);
}
const config = JSON.parse(await readFile("vercel.json", "utf8"));
if (config.framework !== "vite" || config.outputDirectory !== "dist" ||
    config.buildCommand !== "npm run build && npm run test:browser:ci") {
  throw new Error("Vercel settings are not aligned with the application build.");
}
console.log("Vercel build verified:", assets.length, "hashed assets precached");
