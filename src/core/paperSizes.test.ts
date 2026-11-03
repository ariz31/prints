import assert from "node:assert/strict";
import test from "node:test";
import {PAPER_GROUPS,PAPER_SIZES,getPaperDimensions,isPaperName} from "./layout.ts";
test("all built-in papers have correct physical sizes and appear once in menu",()=>{
 const names=PAPER_GROUPS.flatMap(group=>group.papers);
 assert.equal(new Set(names).size,names.length);
 assert.deepEqual(new Set(names),new Set(Object.keys(PAPER_SIZES)));
 assert.ok(Object.values(PAPER_SIZES).every(x=>Number.isFinite(x.widthMm)&&
   Number.isFinite(x.heightMm)&&x.widthMm>0&&x.heightMm>0));
 assert.deepEqual(getPaperDimensions("Long Bond","portrait"),{widthMm:215.9,heightMm:330.2});
 assert.deepEqual(getPaperDimensions("Tabloid","portrait"),{widthMm:279.4,heightMm:431.8});
 assert.deepEqual(getPaperDimensions("A3+","portrait"),{widthMm:329,heightMm:483});
 assert.deepEqual(getPaperDimensions("4R","landscape"),{widthMm:152.4,heightMm:101.6});
 assert.deepEqual(getPaperDimensions("Custom","portrait",{widthMm:205,heightMm:350}),
   {widthMm:205,heightMm:350});
 assert.equal(isPaperName("Custom"),true);
 assert.equal(isPaperName("A5"),true);
 assert.equal(isPaperName("__proto__"),false);
});
