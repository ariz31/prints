import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import {composeSheets} from "../src/features/sheet-composer/logic/layout.ts";

/**
 * Deterministic CPU-only geometry microbenchmark.
 * It does NOT measure Android interaction latency, DOM painting, PDF memory,
 * or the original reported slowdown. Run the same script on base and PR head.
 *
 * npm run benchmark:large-batches
 */
const paper={paperWidthMm:210,paperHeightMm:297,marginMm:5,gapMm:2};
const fixtures=[
  {
    name:"fixed rectangle / optimized packing",
    counts:[30,60,61,100,200,500,1000],
    job:(count)=>({items:[{id:"photo",widthMm:20,heightMm:20,quantity:count,canRotate:false}],
      settings:{...paper,packing:"optimized",autoRotate:false}}),
  },
  {
    name:"single shaped / contour nesting",
    counts:[30,60,61,100,200],
    job:(count)=>({items:[{id:"label",widthMm:24,heightMm:24,
      quantity:count,cropShape:"hexagon",canRotate:true}],
      settings:{...paper,packing:"optimized",autoRotate:true}}),
  },
  {
    name:"mixed shaped / ordered placement",
    counts:[30,60,61,100],
    job:(count)=>{
      const a=Math.ceil(count/2);
      return {items:[
        {id:"star",widthMm:34,heightMm:33,quantity:a,cropShape:"star",canRotate:false},
        {id:"triangle",widthMm:32,heightMm:31,quantity:count-a,cropShape:"triangle",canRotate:false},
      ],settings:{...paper,packing:"ordered",autoRotate:false}};
    },
  },
];

const median=values=>values[Math.floor(values.length/2)];
const results=[];
for(const fixture of fixtures){
  for(const copies of fixture.counts){
    const {items,settings}=fixture.job(copies);
    // Warm up to avoid reporting initial module load as packing time.
    composeSheets(items,settings);
    const elapsed=[];
    let pageCount=0;
    for(let run=0;run<5;run++){
      const start=performance.now();
      const pages=composeSheets(items,settings);
      elapsed.push(performance.now()-start);
      pageCount=pages.length;
      const all=pages.flatMap(p=>p.placements);
      assert.equal(all.length,copies,fixture.name+": missing copies");
      assert.equal(new Set(all.map(p=>p.itemId+":"+p.copyIndex)).size,copies,
        fixture.name+": duplicate copy indices");
    }
    elapsed.sort((a,b)=>a-b);
    results.push({fixture:fixture.name,copies,pages:pageCount,
      medianMs:Number(median(elapsed).toFixed(3)),
      maxMs:Number(elapsed[elapsed.length-1].toFixed(3))});
  }
}
console.table(results);
console.log("These are CPU layout microbenchmarks, not UI responsiveness or export benchmarks.");
