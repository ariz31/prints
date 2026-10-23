import assert from "node:assert/strict";
import test from "node:test";
import { composeSheets, getPaperDimensions, MM_PER_INCH, PDF_POINTS_PER_MM } from "./layout.ts";

const A4 = { paperWidthMm: 210, paperHeightMm: 297, marginMm: 5, gapMm: 3 };

test("international dimensions and PDF conversion", () => {
  assert.equal(MM_PER_INCH, 25.4);
  assert.ok(Math.abs(50.8 * PDF_POINTS_PER_MM - 144) < 1e-10);
  assert.deepEqual(getPaperDimensions("A4", "landscape"), { widthMm: 297, heightMm: 210 });
  assert.deepEqual(getPaperDimensions("A3", "portrait"), { widthMm: 297, heightMm: 420 });
});

test("2x2 inch portraits tile without overflow and paginate exactly", () => {
  const pages = composeSheets([{ id: "photo", widthMm: 50.8, heightMm: 50.8, quantity: 30 }], A4);
  assert.equal(pages.reduce((sum, page) => sum + page.placements.length, 0), 30);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].placements.length, 15);
  for (const page of pages) {
    for (const p of page.placements) {
      assert.ok(p.xMm >= 5 && p.yMm >= 5);
      assert.ok(p.xMm + p.widthMm <= 205 + 1e-7);
      assert.ok(p.yMm + p.heightMm <= 292 + 1e-7);
    }
    for (let i = 0; i < page.placements.length; i++) {
      for (let j = i + 1; j < page.placements.length; j++) {
        const a = page.placements[i]; const b = page.placements[j];
        const overlaps = a.xMm < b.xMm + b.widthMm - 1e-7 &&
          b.xMm < a.xMm + a.widthMm - 1e-7 &&
          a.yMm < b.yMm + b.heightMm - 1e-7 &&
          b.yMm < a.yMm + a.heightMm - 1e-7;
        assert.equal(overlaps, false);
      }
    }
  }
});

test("preserves quantity of multiple different items", () => {
  const pages = composeSheets([
    { id: "a", widthMm: 50, heightMm: 50, quantity: 9 },
    { id: "b", widthMm: 80, heightMm: 30, quantity: 6 },
  ], A4);
  assert.equal(pages.flatMap((p) => p.placements).filter((p) => p.itemId === "a").length, 9);
  assert.equal(pages.flatMap((p) => p.placements).filter((p) => p.itemId === "b").length, 6);
});

test("exactly fitting images at zero margin and gap", () => {
  const pages = composeSheets([{ id: "x", widthMm: 100, heightMm: 100, quantity: 5 }],
    { paperWidthMm: 200, paperHeightMm: 200, marginMm: 0, gapMm: 0 });
  assert.equal(pages.length, 2);
  assert.equal(pages[0].placements.length, 4);
});

test("rejects invalid inputs safely", () => {
  assert.deepEqual(composeSheets([], A4), []);
  assert.throws(() => composeSheets([{ id: "x", widthMm: 300, heightMm: 10, quantity: 1 }], A4), /larger/);
  assert.throws(() => composeSheets([{ id: "x", widthMm: 50, heightMm: 50, quantity: 1.5 }], A4), /integer/);
  assert.throws(() => composeSheets([], { ...A4, marginMm: 110 }), /Margins/);
  assert.throws(() => composeSheets([], { ...A4, gapMm: -1 }), /nonnegative/);
  assert.throws(() => composeSheets([{ id: "x", widthMm: 20, heightMm: 20, quantity: 1001 }], A4), /1,000/);
});

test("large full-page batches are capped to prevent memory exhaustion", () => {
  const job=[{id:"poster",widthMm:200,heightMm:287,quantity:201}];
  assert.throws(()=>composeSheets(job,A4),/exceeds 200 print sheets/);
  assert.equal(composeSheets([{...job[0],quantity:200}],A4).length,200);
});

test("compact layout can reduce sheets for mixed products without losing copies",()=>{
 const products=[
  {id:"a",widthMm:60,heightMm:40,quantity:1},
  {id:"b",widthMm:40,heightMm:60,quantity:1},
  {id:"c",widthMm:60,heightMm:60,quantity:1},
  {id:"d",widthMm:40,heightMm:40,quantity:1},
 ];
 const opts={paperWidthMm:100,paperHeightMm:100,marginMm:0,gapMm:0};
 const ordered=composeSheets(products,{...opts,packing:"ordered"});
 const compact=composeSheets(products,{...opts,packing:"compact"});
 assert.equal(ordered.length,2);
 assert.equal(compact.length,1);
 assert.deepEqual(compact.flatMap(p=>p.placements).map(x=>x.itemId).sort(),
  products.map(x=>x.id).sort());
 for(const a of compact[0].placements)for(const b of compact[0].placements){
   if(a.itemId===b.itemId)continue;
   const overlap=a.xMm<b.xMm+b.widthMm&&b.xMm<a.xMm+a.widthMm&&
     a.yMm<b.yMm+b.heightMm&&b.yMm<a.yMm+a.heightMm;
   assert.equal(overlap,false);
 }
});

test("zero quantities and dimensions are rejected without producing corrupt sheets",()=>{
 for(const change of [{quantity:0},{widthMm:0},{heightMm:0}]){
   assert.throws(()=>composeSheets([
     {id:"zero",widthMm:50,heightMm:50,quantity:1,...change},
   ],A4),/positive|integer/);
 }
 for(const change of [{paperWidthMm:0},{paperHeightMm:0}]){
   assert.throws(()=>composeSheets([], {...A4,...change}),/positive/);
 }
 // Zero margins and zero spacing are valid choices and do not cause crashes.
 assert.ok(composeSheets([{id:"photo",widthMm:50,heightMm:50,quantity:1}],
   {...A4,marginMm:0,gapMm:0}).length>0);
});

test("optimized rotation reduces mixed-size page count without clipping or duplication",()=>{
 const opts={paperWidthMm:100,paperHeightMm:70,marginMm:0,gapMm:0};
 const designs=[{id:"portrait",widthMm:60,heightMm:70,quantity:1,canRotate:false},
  {id:"photo",widthMm:70,heightMm:40,quantity:1,canRotate:true}];
 assert.equal(composeSheets(designs,{...opts,packing:"compact"}).length,2);
 const optimized=composeSheets(designs,{...opts,packing:"optimized",autoRotate:true});
 assert.equal(optimized.length,1);
 const copies=optimized.flatMap(p=>p.placements);
 assert.deepEqual(copies.map(p=>p.itemId).sort(),["photo","portrait"]);
 assert.equal(copies.find(p=>p.itemId==="photo")?.rotated,true);
 for(const p of copies){
  assert.ok(p.xMm>=0&&p.yMm>=0);
  assert.ok(p.xMm+p.widthMm<=100+1e-7);
  assert.ok(p.yMm+p.heightMm<=70+1e-7);
 }
 for(const a of copies)for(const b of copies){
  if(a===b)continue;
  assert.ok(a.xMm+a.widthMm<=b.xMm+1e-7||
    b.xMm+b.widthMm<=a.xMm+1e-7||
    a.yMm+a.heightMm<=b.yMm+1e-7||
    b.yMm+b.heightMm<=a.yMm+1e-7);
 }
 assert.equal(composeSheets(designs,{...opts,packing:"optimized",autoRotate:false}).length,2);
});

test("optimized mode respects clearances and is deterministic",()=>{
 const opts={paperWidthMm:210,paperHeightMm:297,marginMm:5,gapMm:3,
  packing:"optimized" as const,autoRotate:true};
 const designs=[
  {id:"label",widthMm:35,heightMm:20,quantity:14,canRotate:true},
  {id:"photo",widthMm:50.8,heightMm:50.8,quantity:18,canRotate:true},
  {id:"title",widthMm:80,heightMm:30,quantity:5,canRotate:false},
 ];
 const pages=composeSheets(designs,opts);
 assert.deepEqual(composeSheets(designs,opts),pages);
 assert.ok(pages.length<=composeSheets(designs,{...opts,packing:"compact"}).length);
 for(const page of pages){
  for(const a of page.placements){
   assert.ok(a.xMm>=5-1e-7 && a.yMm>=5-1e-7);
   assert.ok(a.xMm+a.widthMm<=205+1e-7 && a.yMm+a.heightMm<=292+1e-7);
   if(a.rotated)assert.ok(designs.find(d=>d.id===a.itemId)?.canRotate);
   for(const b of page.placements){
    if(a===b)continue;
    assert.ok(a.xMm+a.widthMm+3<=b.xMm+1e-7||
      b.xMm+b.widthMm+3<=a.xMm+1e-7||
      a.yMm+a.heightMm+3<=b.yMm+1e-7||
      b.yMm+b.heightMm+3<=a.yMm+1e-7);
   }
  }
 }
 assert.equal(pages.flatMap(p=>p.placements).length,37);
});
