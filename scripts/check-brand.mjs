import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { brandAssets } from "./build-brand.mjs";

// Check in-source geometry vs committed artwork BEFORE the production build.
// A human-edited SVG that drifts from the single source of truth cannot ship.
const expected=[
 "public/wordmark.svg","public/wordmark-reverse.svg","public/symbol.svg",
 "public/mark.svg","public/icon.svg","public/icon-maskable.svg",
 "docs/brand/impression.svg",
];
assert.deepEqual(Object.keys(brandAssets).sort(),expected.sort());
for(const name of expected) {
 const found=await readFile(new URL("../"+name,import.meta.url),"utf8");
 assert.equal(found,brandAssets[name],name+" is stale; run npm run brand.");
 assert.match(found,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="/);
 assert.doesNotMatch(found,/<script\b|<foreignObject\b|<image\b|<use\b|https?:\/\/(?!www\.w3\.org\/2000\/svg)/i,
   "Brand art must be self-contained and not execute/load remote content.");
}
assert.equal(brandAssets["public/mark.svg"],brandAssets["public/icon.svg"],
 "App tiles must use one shared glyph.");
assert.ok(brandAssets["public/icon-maskable.svg"].includes('rx="0"'),
 "Maskable icon must have a full-bleed background.");
assert.ok((await stat(new URL("../docs/brand/impression.png",import.meta.url))).size>1024,
 "Brand preview image is absent.");
const manifest=JSON.parse(await readFile(new URL("../public/manifest.webmanifest",import.meta.url),"utf8"));
assert.ok(manifest.icons.some(i=>i.src==="/icon-maskable.svg"&&i.purpose==="maskable"),
 "Maskable PWA icon purpose declaration is missing.");
assert.ok(manifest.icons.some(i=>i.src==="/icon.svg"&&i.purpose==="any"),
 "Ordinary PWA icon purpose declaration is missing.");
const app=await readFile(new URL("../src/App.tsx",import.meta.url),"utf8");
assert.match(app,/src="\/wordmark\.svg"[^>]*alt="PRINTS"/,
 "Header wordmark must have accessible alternative text.");
const css=await readFile(new URL("../src/styles.css",import.meta.url),"utf8");
assert.match(css,/\.brand-wordmark\{width:132px;max-width:100%;height:auto/,
 "Header brand must have a bounded aspect-ratio-preserving size.");
assert.match(css,/\.brand\{[^}]*min-width:0;flex-shrink:1\}/,
 "Header wordmark must be allowed to shrink in narrow panes.");
assert.match(css,/@media\(max-width:360px\)[\s\S]*?\.brand-wordmark\{width:88px\}/,
 "Small-screen header must have a compact wordmark.");

// Enforce legibility of text on brand surfaces as tokens evolve.
// These checks cover normal-size text at WCAG AA's 4.5:1 contrast threshold.
const token=name=>{
 const m=css.match(new RegExp("--"+name+":(#[0-9a-fA-F]{6})"));
 assert.ok(m,"Missing brand CSS token: "+name);
 return m[1];
};
const luminance=color=>{
 const values=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255);
 const linear=values.map(x=>x<=0.04045?x/12.92:Math.pow((x+0.055)/1.055,2.4));
 return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
};
const contrast=(a,b)=>{
 const [light,dark]=[luminance(a),luminance(b)].sort((x,y)=>y-x);
 return (light+.05)/(dark+.05);
};
for(const [foreground,background] of [
 ["ink","brand-coral"],["ink","brand-coral-hover"],
 ["ink-muted","brand-paper"],["ink-muted","surface"],
 ["accent","brand-paper"]
]){
 const ratio=contrast(token(foreground),token(background));
 assert.ok(ratio>=4.5,
  "Brand text contrast below WCAG AA: "+foreground+" on "+background+" = "+ratio.toFixed(2));
}
assert.ok(contrast(token("focus"),token("brand-paper"))>=3,
 "Focus indicator should be visibly distinct from the branded header.");
console.log("Impression contrast audit passed: primary, hover, muted and focus tokens.");
console.log("Impression brand audit passed:",expected.length,"generated SVGs and PWA metadata.");
