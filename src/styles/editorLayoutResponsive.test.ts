import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

// Evaluate the relevant CSS cascade at representative viewport sizes without
// running browser E2E suites. Import order is the same one Vite builds.
const entry=new URL("../styles.css",import.meta.url);
const imports=[...readFileSync(entry,"utf8").matchAll(/@import\s+"([^"]+)";/g)]
  .map(match=>match[1]);
const css=imports.map(path=>readFileSync(new URL(path,entry),"utf8")).join("\n")
  .replace(/\/\*[\s\S]*?\*\//g,"");

type Screen={width:number;height:number};
type Rule={selectors:string[];media:string[];declarations:Record<string,string>;order:number};
const rules:Rule[]=[];
function collect(input:string,media:string[]=[]){
 let cursor=0;
 while(cursor<input.length){
   const open=input.indexOf("{",cursor);
   if(open<0)break;
   const header=input.slice(cursor,open).trim();
   let depth=1,end=open+1;
   for(;end<input.length&&depth;end++){
     if(input[end]==="{")depth++;
     else if(input[end]==="}")depth--;
   }
   assert.equal(depth,0,"CSS braces must be balanced");
   const body=input.slice(open+1,end-1);
   if(header.startsWith("@media"))collect(body,[...media,header]);
   else if(!header.startsWith("@")){
     const declarations:Record<string,string>={};
     for(const match of body.matchAll(/(grid-template-(?:columns|rows))\s*:\s*([^;}]+)/g)){
       declarations[match[1]]=match[2].trim();
     }
     if(Object.keys(declarations).length){
       rules.push({selectors:header.split(",").map(s=>s.trim()),
         media,declarations,order:rules.length});
     }
   }
   cursor=end;
 }
}
collect(css);

function applies(query:string,screen:Screen){
 const expressions=[...query.matchAll(/\(([^()]+)\)/g)].map(m=>m[1].trim());
 return expressions.length>0&&expressions.every(expr=>{
   const dimension=expr.match(/^(min|max)-(width|height)\s*:\s*(\d+)px$/);
   if(dimension){
     const actual=dimension[2]==="width"?screen.width:screen.height;
     const limit=Number(dimension[3]);
     return dimension[1]==="max"?actual<=limit:actual>=limit;
   }
   if(expr==="orientation:portrait")return screen.height>=screen.width;
   if(expr==="orientation:landscape")return screen.width>screen.height;
   return false;
 });
}
function grid(target:string,screen:Screen){
 const classes=new Set([...target.matchAll(/\.([\w-]+)/g)].map(m=>m[1]));
 const properties:Record<string,{value:string;specificity:number;order:number}>={};
 for(const rule of rules){
   if(!rule.media.every(query=>applies(query,screen)))continue;
   for(const selector of rule.selectors){
     // The studied editor grids have class-only descendant selectors.
     if(!/^(?:\.[\w-]+\s*)+$/.test(selector))continue;
     const selectors=[...selector.matchAll(/\.([\w-]+)/g)].map(m=>m[1]);
     if(!selectors.length||!selectors.every(name=>classes.has(name)))continue;
     if(!selectors.includes(target.split(".").at(-1)??""))continue;
     const specificity=selectors.length;
     for(const [property,value] of Object.entries(rule.declarations)){
       const previous=properties[property];
       if(!previous||specificity>previous.specificity||
          (specificity===previous.specificity&&rule.order>previous.order)){
         properties[property]={value,specificity,order:rule.order};
       }
     }
   }
 }
 return {columns:properties["grid-template-columns"]?.value,
   rows:properties["grid-template-rows"]?.value};
}

test("crop, cleanup and design layers stack preview over inspector on portrait phones",()=>{
 for(const width of [300,320,360,390,430,700,760,800]){
   const actual=grid(".editor-layout",{width,height:900});
   assert.deepEqual(actual,{
     columns:"minmax(0,1fr)",rows:"minmax(0,56%) minmax(0,44%)",
   },width+"px portrait must show a wide preview and a real controls row");
 }
});

test("shared editor grids stay bounded on short phones and rotate cleanly",()=>{
 assert.deepEqual(grid(".editor-layout",{width:360,height:600}),{
   columns:"minmax(0,1fr)",rows:"minmax(0,51%) minmax(0,49%)",
 });
 assert.deepEqual(grid(".editor-layout",{width:844,height:390}),{
   columns:"minmax(0,1fr) minmax(260px,38%)",rows:"minmax(0,1fr)",
 });
 assert.deepEqual(grid(".editor-layout",{width:1280,height:900}),{
   columns:"minmax(0,1fr) 330px",rows:undefined,
 });
});

test("Smart ID retains its dedicated portrait and short-phone sizing",()=>{
 for(const width of [390,760,800])assert.deepEqual(grid(".id-workspace .editor-layout",{width,height:900}),{
   columns:"minmax(0,1fr)",rows:"minmax(0,56%) minmax(0,44%)",
 });
 assert.deepEqual(grid(".id-workspace .editor-layout",{width:390,height:600}),{
   columns:"minmax(0,1fr)",rows:"minmax(0,51%) minmax(0,49%)",
 });
});

test("Photo Adjustments mobile overrides win over desktop declarations",()=>{
 for(const width of [320,390,430,700]){
   assert.deepEqual(grid(".photo-adjust-layout",{width,height:900}),{
     columns:"minmax(0,1fr)",rows:"minmax(0,50%) minmax(0,50%)",
   },width+"px photo adjustment portrait");
 }
 assert.deepEqual(grid(".photo-adjust-layout",{width:760,height:1000}),{
   columns:"minmax(0,1fr)",rows:"minmax(0,54%) minmax(0,46%)",
 });
 assert.deepEqual(grid(".photo-adjust-layout",{width:844,height:390}),{
   columns:"minmax(0,1fr) minmax(260px,38%)",rows:"minmax(0,1fr)",
 });
});

test("crop zoom keeps the four-part shared control and mobile overflow guards",()=>{
 const crop=readFileSync(new URL("./features/crop.css",import.meta.url),"utf8");
 const layers=readFileSync(new URL("./features/layers.css",import.meta.url),"utf8");
 assert.match(crop,/\.crop-workspace \.crop-zoom\{flex-wrap:nowrap;min-width:0/);
 assert.match(crop,/\.crop-workspace \.crop-zoom>\.photo-adjust-row\{flex:1 1 0;min-width:0/);
 assert.doesNotMatch(crop,/\.editor-inspector \.crop-zoom label\{/);
 assert.match(layers,/\.editor-inspector\{border-left:0;border-top:1px solid var\(--line\)/);
 assert.match(layers,/\.editor-layout\{grid-template-columns:minmax\(0,1fr\);grid-template-rows:minmax\(0,56%\) minmax\(0,44%\)\}/);
 assert.match(crop,/grid-template-columns:minmax\(48px,\.8fr\) minmax\(22px,1fr\) 48px 32px/);
});
