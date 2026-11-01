import assert from "node:assert/strict";
import test from "node:test";
import {composeNotepadSheets,notepadCutLines,notepadGrid,NOTEPAD_PRESETS,optimalSingleDesignCopies} from "./notepadLayout.ts";
const a4={widthMm:210,heightMm:297};
test("every A4 notepad preset divides paper exactly and uses shared cuts",()=>{
  for(const p of NOTEPAD_PRESETS){
    const g=notepadGrid(p.id,a4,"portrait",5);
    assert.equal(g.copiesPerSheet,Number(p.id));
    assert.equal(g.cutLines,g.columns+g.rows-2);
    assert.ok(Math.abs(g.cellWidthMm*g.columns-210)<1e-7);
    assert.ok(Math.abs(g.cellHeightMm*g.rows-297)<1e-7);
    const asset={id:"notepad",widthMm:g.artWidthMm,heightMm:g.artHeightMm,quantity:g.copiesPerSheet};
    const pages=composeNotepadSheets([asset],p.id,a4,"portrait",5);
    assert.equal(pages.length,1);
    assert.equal(pages[0].placements.length,g.copiesPerSheet);
    const cuts=notepadCutLines(p.id,a4,"portrait",5);
    assert.equal(cuts.length,g.cutLines);
    for(const line of cuts)assert.ok([line.x1,line.x2,line.y1,line.y2].every(Number.isFinite));
    for(const rect of pages[0].placements){
      assert.ok(rect.xMm>=5&&rect.yMm>=5);
      assert.ok(rect.xMm+rect.widthMm<=205+1e-7);
      assert.ok(rect.yMm+rect.heightMm<=292+1e-7);
    }
  }
});
test("landscape transposes the grids without changing the count",()=>{
  const paper={widthMm:297,heightMm:210};
  const g=notepadGrid("6",paper,"landscape",4);
  assert.deepEqual([g.columns,g.rows,g.copiesPerSheet],[3,2,6]);
  assert.equal(notepadCutLines("6",paper,"landscape",4).length,3);
});
test("a six-up grid has three straight lines and six equally sized art cells",()=>{
  const g=notepadGrid("6",a4,"portrait",5);
  assert.deepEqual([g.cellWidthMm,g.cellHeightMm,g.artWidthMm,g.artHeightMm],[105,99,95,89]);
  const lines=notepadCutLines("6",a4,"portrait",5);
  assert.deepEqual(lines,[{x1:105,y1:5,x2:105,y2:292},
    {x1:5,y1:99,x2:205,y2:99},{x1:5,y1:198,x2:205,y2:198}]);
});
test("manual partial runs and repeated full sheets preserve copy indices",()=>{
  const g=notepadGrid("4",a4,"portrait",5);
  const pages=composeNotepadSheets([{id:"x",widthMm:g.artWidthMm,heightMm:g.artHeightMm,quantity:9}],"4",a4,"portrait",5);
  assert.deepEqual(pages.map(p=>p.placements.length),[4,4,1]);
  assert.deepEqual(pages.flatMap(p=>p.placements.map(x=>x.copyIndex)),[0,1,2,3,4,5,6,7,8]);
});
test("invalid or ambiguous notepad jobs fail instead of truncating",()=>{
  const g=notepadGrid("4",a4,"portrait",5);
  const a={id:"x",widthMm:g.artWidthMm,heightMm:g.artHeightMm,quantity:4};
  assert.throws(()=>composeNotepadSheets([a,{...a,id:"y"}],"4",a4,"portrait",5),/one design/);
  assert.throws(()=>composeNotepadSheets([{...a,widthMm:50}],"4",a4,"portrait",5),/artwork size/);
  assert.throws(()=>notepadGrid("4",a4,"portrait",60),/no printable artwork/);
  assert.throws(()=>notepadGrid("4",{widthMm:297,heightMm:420},"portrait",5),/require A4/);
});
test("optimized copy autofill respects A4 safety margins and rotations",()=>{
  assert.equal(optimalSingleDesignCopies({widthMm:50.8,heightMm:50.8},a4,5,3,false),15);
  assert.equal(optimalSingleDesignCopies({widthMm:95,heightMm:89},a4,5,3,false),6);
  assert.equal(optimalSingleDesignCopies({widthMm:95,heightMm:89},a4,5,3,true),6);
  assert.throws(()=>optimalSingleDesignCopies({widthMm:300,heightMm:100},a4,5,3,false),/does not fit/);
});
