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

test("manual quarter-turn preserves crop dimensions, checks collisions and persists through a later drag",async()=>{
 const {rotateManualPlacement}=await import("./manualLayout.ts");
 const source=composeSheets([{id:"photo",widthMm:40,heightMm:60,quantity:1}],settings);
 const rotated=rotateManualPlacement(source,[],settings,0,"photo",0);
 const page=applyManualPlacements(source,rotated,settings)[0];
 assert.equal(page.placements[0].widthMm,60);assert.equal(page.placements[0].heightMm,40);
 assert.equal(page.placements[0].rotated,true);
 const moved=moveManualPlacement(source,rotated,settings,0,"photo",0,100,100);
 assert.equal(applyManualPlacmentsForTest(source,moved).rotated,true);
 function applyManualPlacmentsForTest(o:typeof source,m:typeof moved){return applyManualPlacements(o,m,settings)[0].placements[0];}
 const restored=rotateManualPlacement(source,moved,settings,0,"photo",0);
 assert.equal(applyManualPlacements(source,restored,settings)[0].placements[0].widthMm,40);
 const crowded=composeSheets([{id:"a",widthMm:70,heightMm:100,quantity:2}],{...settings,paperWidthMm:150,paperHeightMm:110,gapMm:0});
 assert.throws(()=>rotateManualPlacement(crowded,[],{...settings,paperWidthMm:150,paperHeightMm:110,gapMm:0},0,"a",0),/overlap|margins/);
 assert.equal(validManualPlacements([{...rotated[0],rotated:"yes"}]),false);
});
