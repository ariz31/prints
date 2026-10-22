import { createHash } from "node:crypto";

/** The cache identity must change whenever ANY static icon/manifest bytes change.
 * Hashed Vite chunks already carry content hashes, but named assets do not. */
export function cacheFingerprint({ html, template, assets, staticAssets }) {
  if (typeof html !== "string" || typeof template !== "string" ||
      !Array.isArray(assets) || !staticAssets || typeof staticAssets !== "object") {
    throw new Error("Cannot fingerprint an incomplete offline release.");
  }
  const names=Object.keys(staticAssets).sort();
  if (!names.length) throw new Error("Offline shell identity must include static assets.");
  const h=createHash("sha256");
  h.update(html).update("\0").update(template).update("\0");
  h.update(JSON.stringify([...assets].sort())).update("\0");
  for(const name of names) {
    const data=staticAssets[name];
    if(!/^[a-zA-Z0-9._/-]+$/.test(name) ||
       !(data instanceof Uint8Array) || data.byteLength===0) {
      throw new Error("Invalid offline static asset: "+name);
    }
    h.update(name).update("\0").update(data).update("\0");
  }
  return h.digest("hex").slice(0,16);
}
