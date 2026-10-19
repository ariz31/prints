import assert from "node:assert/strict";
import test from "node:test";
import {applyManualPlacements,moveManualPlacement,validManualPlacements} from "./manualLayout.ts";
import {composeSheets} from "./layout.ts";
const settings={paperWidthMm:210,paperHeightMm:297,marginMm:5,gapMm:3,packing:"ordered" as const};
const originals=composeSheets([{id:"portrait",widthMm:50.8,heightMm:50.8,quantity:2}],settings);
test("manual move is exact in millimeters and keeps other copies untouched",()=>{
 const next=moveManualPlacement(originals,[],settings,0,"portrait",1,115,30);
 const adjusted=applyManualPlacements(originals,next,settings);
 assert.equal(next[0].xMm,115);
 assert.equal(adjusted[0].placements[1].xMm,115);
 assert.equal(adjusted[0].placements[1].yMm,30);
 assert.equal(adjusted[0].placements[0].xMm,originals[0].placements[0].xMm);
 assert.equal(originals[0].placements[1].yMm,5);
});
test("moving a copy into another object or outside margins is blocked",()=>{
 assert.throws(()=>moveManualPlacement(originals,[],settings,0,"portrait",1,10,10),/overlap|spacing/);
 assert.throws(()=>moveManualPlacement(originals,[],settings,0,"portrait",1,-2,10),/Invalid|printable margins/);
 assert.throws(()=>moveManualPlacement(originals,[],settings,0,"portrait",1,170,10),/printable margins/);
});
test("old positions do not silently move to different sheets after repacking",()=>{
 const before=moveManualPlacement(originals,[],settings,0,"portrait",1,115,30);
 const changed=composeSheets([{id:"portrait",widthMm:190,heightMm:200,quantity:1}],settings);
 assert.throws(()=>applyManualPlacements(changed,before,settings),/Reset arrangement/);
});
test("manual arrangements validate unique item-copy references",()=>{
 const example={itemId:"p",copyIndex:0,pageIndex:0,xMm:8,yMm:8};
 assert.equal(validManualPlacements([example]),true);
 assert.equal(validManualPlacements([example,{...example}]),false);
 assert.equal(validManualPlacements([{...example,xMm:Infinity}]),false);
});
