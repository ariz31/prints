import assert from "node:assert/strict";
import test from "node:test";
import {reconcileSingleDesign,reconcilePaperSelection} from "./paperReflow.ts";
import {defaultPrintSettings,DEFAULT_PREFERENCES} from "../../../core/preferences.ts";
import type {PhotoAsset} from "../../../core/exportPdf.ts";

const design:PhotoAsset={
 id:"photo",name:"Existing artwork",url:"blob:mock",pixelWidth:2000,pixelHeight:2000,
 crop:{x:0,y:0,width:1,height:1},widthMm:90,heightMm:90,quantity:6,
 focalX:50,focalY:50,layers:[],
};
test("too-small media can be selected without mutating the artwork",()=>{
 const settings={...defaultPrintSettings(DEFAULT_PREFERENCES),
   paper:"A7" as const,packing:"optimized" as const,copyMode:"automatic" as const};
 assert.throws(()=>reconcileSingleDesign([design],settings),/does not fit/);
 const result=reconcilePaperSelection([design],settings);
 assert.equal(result.requiresAdjustment,true);
 assert.deepEqual(result.items,[design]);
 assert.strictEqual(result.items[0],design);
});
test("successful media changes recalculate copies for a one-design optimized job",()=>{
 const settings={...defaultPrintSettings(DEFAULT_PREFERENCES),
   paper:"A3" as const,packing:"optimized" as const,copyMode:"automatic" as const};
 const result=reconcilePaperSelection([design],settings);
 assert.equal(result.requiresAdjustment,false);
 assert.ok(result.items[0].quantity>1);
 assert.deepEqual([result.items[0].widthMm,result.items[0].heightMm],[90,90]);
});
test("custom-paper cut cells recompute without changing source design",()=>{
 const settings={...defaultPrintSettings(DEFAULT_PREFERENCES),paper:"Custom" as const,
   customWidthMm:215.9,customHeightMm:330.2,notepadPreset:"4" as const};
 const original=structuredClone(design);
 const result=reconcilePaperSelection([design],settings);
 assert.equal(result.requiresAdjustment,false);
 assert.equal(result.items[0].widthMm,215.9/2-10);
 assert.equal(result.items[0].heightMm,330.2/2-10);
 assert.deepEqual(design,original);
});
test("invalid cut insets preserve artwork and report needed adjustment",()=>{
 const settings={...defaultPrintSettings(DEFAULT_PREFERENCES),paper:"A7" as const,
   marginMm:40,notepadPreset:"12" as const};
 const result=reconcilePaperSelection([design],settings);
 assert.equal(result.requiresAdjustment,true);
 assert.deepEqual(result.items,[design]);
});
test("unexpected reflow errors remain visible instead of being hidden",()=>{
 const settings={...defaultPrintSettings(DEFAULT_PREFERENCES),paper:"Custom" as const,
   customWidthMm:Number.NaN,notepadPreset:"4" as const};
 assert.throws(()=>reconcilePaperSelection([design],settings),/Invalid|paper|dimensions/i);
});

test("oversized shaped media preserves source artwork instead of corrupting auto-fill",()=>{
 const shaped={...design,cropShape:"star" as const,widthMm:90,heightMm:90};
 const settings={...defaultPrintSettings(DEFAULT_PREFERENCES),
   paper:"A7" as const,packing:"optimized" as const,copyMode:"automatic" as const};
 const original=structuredClone(shaped);
 const checked=reconcilePaperSelection([shaped],settings);
 assert.equal(checked.requiresAdjustment,true);
 assert.deepEqual(checked.items,[original]);
});
