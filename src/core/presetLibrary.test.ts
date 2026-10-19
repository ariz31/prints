import assert from "node:assert/strict";
import test from "node:test";
import { validNamedPreset,parsePresetLibrary } from "./presetLibrary.ts";
const basic={id:"p",name:"A4 2x2",updatedAt:"2026-10-19",itemWidthMm:50.8,itemHeightMm:50.8,quantity:12,
 settings:{paper:"A4",orientation:"portrait",customWidthMm:210,customHeightMm:297,marginMm:5,gapMm:3,cutGuides:true}};
test("named presets validate and reject damaged quantities",()=>{
 assert.equal(validNamedPreset(basic),true);
 assert.equal(validNamedPreset({...basic,quantity:1.5}),false);
 assert.equal(validNamedPreset({...basic,itemHeightMm:Infinity}),false);
});
test("library removes invalid and duplicate IDs",()=>{
 const library=parsePresetLibrary([basic,{...basic,name:"duplicate"},{...basic,id:"next"},null]);
 assert.deepEqual(library.map(x=>x.id),["p","next"]);
});
