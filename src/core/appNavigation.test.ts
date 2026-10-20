import assert from "node:assert/strict";
import test from "node:test";
import {appRouteUrl,readAppRoute,sameRoute} from "./appNavigation.ts";
test("workspace paths roundtrip and remain relative to same origin",()=>{
 for(const view of ["preview","images","print"] as const){
   const parsed=readAppRoute("https://prints.local/"+view);
   assert.equal(parsed.view,view);
   assert.equal(appRouteUrl(parsed),"/"+view);
 }
 assert.deepEqual(readAppRoute("https://prints.local/"),{view:"preview"});
 assert.deepEqual(readAppRoute("https://prints.local/unknown"),{view:"preview"});
});
test("editor and settings browser history states roundtrip",()=>{
 const crop={view:"preview" as const,editor:"crop" as const,assetId:"123/456"};
 assert.deepEqual(readAppRoute(appRouteUrl(crop)),crop);
 const prefs={view:"images" as const,preferences:true};
 assert.deepEqual(readAppRoute(appRouteUrl(prefs)),prefs);
 assert.equal(sameRoute(readAppRoute("/images"),prefs),false);
});
test("unrecognized editor and invalid context safely fall back to workspace",()=>{
 assert.deepEqual(readAppRoute("/preview?editor=evil&asset=123"),{view:"preview"});
 assert.deepEqual(readAppRoute("/preview?editor=crop&asset="),{view:"preview"});
 assert.deepEqual(readAppRoute("/print?editor=crop&asset=abc"),{view:"print"});
 assert.deepEqual(readAppRoute("/preview?editor=crop&asset="+("a".repeat(250))),{view:"preview"});
 assert.deepEqual(readAppRoute("/preview?panel=preferences&editor=crop&asset=123"),
   {view:"preview",preferences:true});
});
