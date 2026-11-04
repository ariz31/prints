import assert from "node:assert/strict";
import test from "node:test";
import {composeSheets,pageUtilization} from "./layout.ts";
import {polygonsConflict,maximumShapeCopies} from "./shapeNesting.ts";
import {shapePolygonMm} from "./cropShapes.ts";
const paper={paperWidthMm:210,paperHeightMm:297,marginMm:5,gapMm:2,
  packing:"optimized" as const,autoRotate:true};

test("coincident polygons collide and complementary triangles can share a box",()=>{
  const a=[{x:0,y:0},{x:2,y:0},{x:0,y:2}];
  const b=[{x:2,y:2},{x:2,y:0},{x:0,y:2}];
  assert.equal(polygonsConflict(a,a,0),true);
  assert.equal(polygonsConflict(a,b,0),false);
  assert.equal(polygonsConflict(a,b,0.1),true);
});
test("shape-aware packing keeps copies, clearances and physical page bounds",()=>{
  const items=[
    {id:"star",widthMm:45,heightMm:45,quantity:7,cropShape:"star" as const,canRotate:true},
    {id:"triangle",widthMm:34,heightMm:42,quantity:5,cropShape:"triangle" as const,canRotate:true},
  ];
  const pages=composeSheets(items,paper);
  assert.deepEqual(pages,composeSheets(items,paper));
  assert.equal(pages.flatMap(p=>p.placements).length,12);
  const lookup=new Map(items.map(i=>[i.id,i]));
  for(const page of pages){
    for(const p of page.placements){
      assert.ok(p.xMm>=5&&p.yMm>=5);
      assert.ok(p.xMm+p.widthMm<=205+1e-5);
      assert.ok(p.yMm+p.heightMm<=292+1e-5);
    }
    for(let i=0;i<page.placements.length;i++)
      for(let j=i+1;j<page.placements.length;j++){
        const a=page.placements[i],b=page.placements[j];
        const pa=shapePolygonMm(lookup.get(a.itemId)!.cropShape,a.xMm,a.yMm,
          a.widthMm,a.heightMm,!!a.rotated);
        const pb=shapePolygonMm(lookup.get(b.itemId)!.cropShape,b.xMm,b.yMm,
          b.widthMm,b.heightMm,!!b.rotated);
        assert.equal(polygonsConflict(pa,pb,2),false,"non-overlapping shaped copies");
      }
    assert.ok(pageUtilization(page,paper)>0);
  }
});
test("single-sheet auto-fill bounded by validated shape packing",()=>{
  const spec={id:"label",widthMm:50,heightMm:50,quantity:1,
    cropShape:"hexagon" as const,canRotate:true};
  const capacity=maximumShapeCopies(spec,paper);
  assert.ok(capacity>=1&&capacity<=200);
  assert.equal(composeSheets([{...spec,quantity:capacity}],paper).length,1);
});
test("oversized local nesting requests fail explicitly instead of degrading silently",()=>{
  assert.throws(()=>composeSheets([
    {id:"shape",widthMm:25,heightMm:25,quantity:201,cropShape:"heart"},
  ],paper),/200 copies/);
});
