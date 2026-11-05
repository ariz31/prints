import assert from "node:assert/strict";
import test from "node:test";
import { validNamedPreset,parsePresetLibrary,matchesNamedPreset } from "./presetLibrary.ts";
import type { NamedPreset } from "./presetLibrary.ts";
const basic:NamedPreset={id:"p",name:"A4 2x2",updatedAt:"2026-10-19",itemWidthMm:50.8,itemHeightMm:50.8,quantity:12,
 settings:{paper:"A4",orientation:"portrait",customWidthMm:210,customHeightMm:297,marginMm:5,gapMm:3,cutGuides:true}};
test("named presets validate and reject damaged quantities",()=>{
 assert.equal(validNamedPreset(basic),true);
 assert.equal(validNamedPreset({...basic,quantity:1.5}),false);
 assert.equal(validNamedPreset({...basic,itemHeightMm:Infinity}),false);
});
test("applied saved layout is detected from the entire current workspace",()=>{
 const images=[{widthMm:50.8,heightMm:50.8,quantity:12},
  {widthMm:50.8,heightMm:50.8,quantity:12}];
 assert.equal(matchesNamedPreset(basic,basic.settings,images),true);
 assert.equal(matchesNamedPreset(basic,{...basic.settings,manualPlacements:[]},images),true);
 assert.equal(matchesNamedPreset(basic,basic.settings,[...images,{widthMm:25.4,heightMm:25.4,quantity:12}]),false);
 assert.equal(matchesNamedPreset(basic,basic.settings,[{...images[0],quantity:13}]),false);
 assert.equal(matchesNamedPreset(basic,{...basic.settings,marginMm:6},images),false);
 assert.equal(matchesNamedPreset(basic,{...basic.settings,paper:"A3"},images),false);
 assert.equal(matchesNamedPreset(basic,basic.settings,[]),false);
 assert.equal(matchesNamedPreset(basic,{...basic.settings,customWidthMm:99},images),true);
 assert.equal(matchesNamedPreset({...basic,settings:{...basic.settings,paper:"Custom"}},
  {...basic.settings,paper:"Custom",customWidthMm:211},images),false);
});
test("library removes invalid and duplicate IDs",()=>{
 const library=parsePresetLibrary([basic,{...basic,name:"duplicate"},{...basic,id:"next"},null]);
 assert.deepEqual(library.map(x=>x.id),["p","next"]);
});
