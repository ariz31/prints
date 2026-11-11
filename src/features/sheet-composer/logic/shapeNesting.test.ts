import assert from "node:assert/strict";
import test from "node:test";
import {composeSheets,pageUtilization} from "./layout.ts";
import {polygonsConflict,maximumShapeCopies} from "./shapeNesting.ts";
import {shapePolygonMm} from "../../../core/cropShapes.ts";
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
     {id:"shape",widthMm:25,heightMm:25,quantity:1001,cropShape:"heart"},
  ],paper),/1,000 copies/);
});

test("ordered mixed contours preserve source order and enforce physical clearance",()=>{
  const products=[
    {id:"a",widthMm:36,heightMm:35,quantity:2,cropShape:"star" as const},
    {id:"b",widthMm:25,heightMm:40,quantity:2,cropShape:"triangle" as const},
    {id:"c",widthMm:50,heightMm:24,quantity:1,cropShape:"rectangle" as const},
  ];
  const result=composeSheets(products,{...paper,packing:"ordered"});
  assert.deepEqual(result.flatMap(pg=>pg.placements.map(p=>p.itemId)),["a","a","b","b","c"]);
  assert.equal(result.flatMap(pg=>pg.placements).length,5);
  for(const pg of result)for(let i=0;i<pg.placements.length;i++)
    for(let j=i+1;j<pg.placements.length;j++){
      const a=pg.placements[i],b=pg.placements[j];
      const sa=products.find(p=>p.id===a.itemId)!,sb=products.find(p=>p.id===b.itemId)!;
      assert.equal(polygonsConflict(
        shapePolygonMm(sa.cropShape,a.xMm,a.yMm,a.widthMm,a.heightMm,!!a.rotated),
        shapePolygonMm(sb.cropShape,b.xMm,b.yMm,b.widthMm,b.heightMm,!!b.rotated),2),false);
    }
});
test("too-small printable sheet refuses misleading single-copy auto-fill",()=>{
  const spec={id:"oversized",widthMm:180,heightMm:250,quantity:1,cropShape:"star" as const};
  assert.throws(()=>maximumShapeCopies(spec,{...paper,paperWidthMm:60,paperHeightMm:70}),
    /does not fit the printable sheet/);
});

test("all 15 contours retain quantity and safe spacing on mixed-size jobs",async()=>{
 const {CROP_SHAPES}=await import("../../../core/cropShapes.ts");
 for(const [index,shape] of CROP_SHAPES.entries()){
   const spec={id:shape.id,widthMm:28+(index%4)*4,heightMm:25+(index%3)*5,
     quantity:3,cropShape:shape.id,canRotate:true};
   const pages=composeSheets([spec],paper);
   assert.equal(pages.flatMap(p=>p.placements).length,3,shape.id);
   for(const page of pages)for(let i=0;i<page.placements.length;i++)
     for(let j=i+1;j<page.placements.length;j++){
       const a=page.placements[i],b=page.placements[j];
       assert.equal(polygonsConflict(
         shapePolygonMm(shape.id,a.xMm,a.yMm,a.widthMm,a.heightMm,!!a.rotated),
         shapePolygonMm(shape.id,b.xMm,b.yMm,b.widthMm,b.heightMm,!!b.rotated),paper.gapMm),false,
         shape.id+" overlapping cutouts");
     }
 }
});

test("dense 61–100 shaped copies retain exact clearance and deterministic results",()=>{
  // Regression for the reported high-copy threshold. Validate exact polygons,
  // not just the broad-phase index or reported copy count.
  for(const quantity of [61,100]){
    const designs=[
      {id:"repeat",widthMm:22,heightMm:20,quantity,cropShape:"hexagon" as const,canRotate:true},
    ];
    const pages=composeSheets(designs,paper);
    assert.deepEqual(pages,composeSheets(designs,paper));
    const placements=pages.flatMap(p=>p.placements);
    assert.equal(placements.length,quantity);
    assert.equal(new Set(placements.map(p=>p.itemId+":"+p.copyIndex)).size,quantity);
    for(const sheet of pages){
      for(const p of sheet.placements){
        assert.ok(p.xMm>=paper.marginMm-1e-5);
        assert.ok(p.yMm>=paper.marginMm-1e-5);
        assert.ok(p.xMm+p.widthMm<=paper.paperWidthMm-paper.marginMm+1e-5);
        assert.ok(p.yMm+p.heightMm<=paper.paperHeightMm-paper.marginMm+1e-5);
      }
      for(let i=0;i<sheet.placements.length;i++){
        const a=sheet.placements[i];
        const polyA=shapePolygonMm("hexagon",a.xMm,a.yMm,a.widthMm,a.heightMm,!!a.rotated);
        for(let j=i+1;j<sheet.placements.length;j++){
          const b=sheet.placements[j];
          assert.equal(polygonsConflict(polyA,
            shapePolygonMm("hexagon",b.xMm,b.yMm,b.widthMm,b.heightMm,!!b.rotated),
            paper.gapMm),false,"dense shaped copies must retain physical clearance");
        }
      }
    }
  }
});

test("100-copy mixed contours preserve exact spacing and stable first-fit order",()=>{
  const items=[
    {id:"star-mix",widthMm:34,heightMm:33,quantity:50,
      cropShape:"star" as const,canRotate:true},
    {id:"triangle-mix",widthMm:32,heightMm:31,quantity:50,
      cropShape:"triangle" as const,canRotate:true},
  ];
  const options={...paper,packing:"ordered" as const};
  const pages=composeSheets(items,options);
  assert.deepEqual(pages,composeSheets(items,options));
  const all=pages.flatMap(page=>page.placements);
  assert.equal(all.length,100);
  assert.deepEqual(all.slice(0,50).map(p=>p.itemId),Array(50).fill("star-mix"));
  assert.deepEqual(all.slice(50).map(p=>p.itemId),Array(50).fill("triangle-mix"));
  const byId=new Map(items.map(item=>[item.id,item]));
  for(const page of pages)for(let i=0;i<page.placements.length;i++){
    const a=page.placements[i],ia=byId.get(a.itemId)!;
    assert.ok(a.xMm>=options.marginMm-1e-5&&a.yMm>=options.marginMm-1e-5);
    assert.ok(a.xMm+a.widthMm<=options.paperWidthMm-options.marginMm+1e-5);
    assert.ok(a.yMm+a.heightMm<=options.paperHeightMm-options.marginMm+1e-5);
    const polyA=shapePolygonMm(ia.cropShape,a.xMm,a.yMm,a.widthMm,a.heightMm,!!a.rotated);
    for(let j=i+1;j<page.placements.length;j++){
      const b=page.placements[j],ib=byId.get(b.itemId)!;
      assert.equal(polygonsConflict(polyA,shapePolygonMm(ib.cropShape,
        b.xMm,b.yMm,b.widthMm,b.heightMm,!!b.rotated),options.gapMm),false);
    }
  }
});

test("59-to-60-copy threshold does not rearrange existing shaped copies",()=>{
  const spec={id:"threshold",widthMm:52,heightMm:54,
    cropShape:"star" as const,canRotate:true};
  const before=composeSheets([{...spec,quantity:59}],paper)
    .flatMap(page=>page.placements);
  const after=composeSheets([{...spec,quantity:60}],paper)
    .flatMap(page=>page.placements);
  assert.equal(before.length,59);
  assert.equal(after.length,60);
  assert.deepEqual(after.slice(0,59),before,
    "optimizing the high-copy path must not rearrange earlier copies");
});

test("repeated 61-copy contours reuse the exact first-sheet packing template",()=>{
  const pages=composeSheets([{id:"repeat",widthMm:52,heightMm:54,
    quantity:61,cropShape:"star" as const,canRotate:true}],paper);
  assert.ok(pages.length>1,"fixture must exercise multiple physical sheets");
  const first=pages[0].placements;
  assert.ok(first.length>0);
  const every=pages.flatMap(pg=>pg.placements);
  assert.deepEqual(every.map(p=>p.copyIndex),Array.from({length:61},(_,i)=>i));
  for(const page of pages.slice(1)){
    for(let i=0;i<page.placements.length;i++){
      const current=page.placements[i],template=first[i];
      assert.equal(current.xMm,template.xMm);
      assert.equal(current.yMm,template.yMm);
      assert.equal(current.widthMm,template.widthMm);
      assert.equal(current.heightMm,template.heightMm);
      assert.equal(!!current.rotated,!!template.rotated);
    }
  }
});

test("paper utilization uses contour area rather than rectangle bounding boxes",()=>{
 const pg={placements:[{itemId:"s",copyIndex:0,xMm:0,yMm:0,
   widthMm:10,heightMm:10,cropShape:"triangle" as const}]};
 const coverage=pageUtilization(pg,{...paper,paperWidthMm:10,paperHeightMm:10});
 assert.ok(Math.abs(coverage-0.5)<1e-8);
});

test("rounded rectangles honor exact horizontal and vertical item gaps",()=>{
  const layout={paperWidthMm:210,paperHeightMm:297,marginMm:5,gapMm:3,
    packing:"optimized" as const,autoRotate:false};
  const pages=composeSheets([{id:"round",widthMm:40,heightMm:40,
    quantity:12,cropShape:"rounded" as const}],layout);
  const first=pages[0].placements;
  assert.ok(first.length>=5);
  assert.equal(first[0].xMm,5);
  assert.equal(first[0].yMm,5);
  assert.equal(first[1].xMm,48);
  assert.equal(first[1].yMm,5);
  assert.ok(first.some(p=>Math.abs(p.xMm-5)<1e-6&&Math.abs(p.yMm-48)<1e-6));
});

test("fractional gaps are not rounded to the shaped search grid",()=>{
  for(const shape of ["rounded","oval","circle"] as const){
    const options={paperWidthMm:210,paperHeightMm:297,marginMm:5,gapMm:2.5,
      packing:"ordered" as const,autoRotate:false};
    const page=composeSheets([{id:"g",widthMm:40,heightMm:40,
      quantity:3,cropShape:shape}],options)[0];
    assert.equal(page.placements[1].xMm-page.placements[0].xMm-40,2.5,shape);
  }
});

test("1,000 repeated shaped copies preserve copy count and spacing without recomputing sheets",()=>{
  const spec={id:"batch",widthMm:52,heightMm:52,quantity:1000,
    cropShape:"rounded" as const,canRotate:false};
  const layout={paperWidthMm:210,paperHeightMm:297,marginMm:5,gapMm:3,
    packing:"optimized" as const,autoRotate:false};
  const pages=composeSheets([spec],layout);
  assert.equal(pages.flatMap(page=>page.placements).length,1000);
  assert.ok(pages.length<=200);
  const first=pages[0].placements;
  for(const pg of pages){
    for(let i=0;i<pg.placements.length;i++){
      const a=pg.placements[i],reference=first[i];
      assert.equal(a.xMm,reference.xMm);
      assert.equal(a.yMm,reference.yMm);
      for(let j=0;j<i;j++){
        const b=pg.placements[j];
        assert.equal(polygonsConflict(
          shapePolygonMm("rounded",a.xMm,a.yMm,a.widthMm,a.heightMm),
          shapePolygonMm("rounded",b.xMm,b.yMm,b.widthMm,b.heightMm),
          layout.gapMm),false);
      }
    }
  }
});

test("mixed rounded, curved and rectangular crops preserve minimum clearance",()=>{
  const specs=[
    {id:"round",widthMm:40,heightMm:35,quantity:4,cropShape:"rounded" as const},
    {id:"circle",widthMm:32,heightMm:32,quantity:4,cropShape:"circle" as const},
    {id:"rect",widthMm:29,heightMm:32,quantity:4,cropShape:"rectangle" as const},
  ];
  const config={paperWidthMm:210,paperHeightMm:297,marginMm:5,gapMm:2.5,
    packing:"optimized" as const,autoRotate:false};
  const pages=composeSheets(specs,config);
  assert.equal(pages.flatMap(p=>p.placements).length,12);
  for(const pg of pages)for(let i=0;i<pg.placements.length;i++)
    for(let j=0;j<i;j++){
      const a=pg.placements[i],b=pg.placements[j];
      assert.equal(polygonsConflict(
        shapePolygonMm(a.cropShape,a.xMm,a.yMm,a.widthMm,a.heightMm),
        shapePolygonMm(b.cropShape,b.xMm,b.yMm,b.widthMm,b.heightMm),
        config.gapMm),false);
    }
});
