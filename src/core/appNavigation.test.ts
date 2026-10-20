import assert from "node:assert/strict";
import test from "node:test";
import {appRouteUrl,readAppRoute,sameRoute,recordAppNavigation} from "./appNavigation.ts";
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

test("Android Back-style browser history visits prior view without reloading",()=>{
 type Entry={url:string;state:Record<string,unknown>};
 const stack:Entry[]=[{url:"/preview",state:{}}];
 let index=0;
 const history={
   get state(){return stack[index].state;},
   pushState(state:unknown,_unused:string,url?:string|URL|null){
     stack.splice(index+1);
     stack.push({url:String(url),state:state as Record<string,unknown>});
     index++;
   },
   replaceState(state:unknown,_unused:string,url?:string|URL|null){
     stack[index]={url:String(url),state:state as Record<string,unknown>};
   },
   back(){if(index>0)index--;},
   forward(){if(index<stack.length-1)index++;},
   get current(){return readAppRoute(stack[index].url);},
 };
 assert.equal(recordAppNavigation(history,history.current,{view:"images"}),true);
 assert.equal(recordAppNavigation(history,history.current,{view:"print"}),true);
 assert.equal(recordAppNavigation(history,history.current,{view:"print"}),false);
 assert.equal(stack.length,3);
 history.back();assert.equal(history.current.view,"images");
 history.back();assert.equal(history.current.view,"preview");
 history.forward();assert.equal(history.current.view,"images");
 assert.equal(recordAppNavigation(history,history.current,
   {view:"preview",editor:"crop",assetId:"photo-1"}),true);
 history.back();assert.deepEqual(history.current,{view:"images"});
 history.forward();assert.equal(history.current.editor,"crop");
 assert.equal(recordAppNavigation(history,history.current,
   {view:"preview"},true),true);
 assert.equal(stack.length,3,"Replacing a direct editor route must not add history");
 assert.deepEqual(history.current,{view:"preview"});
});

test("full photo adjustment editor has stable browser Back and deep-link routes",()=>{
 const route={view:"preview" as const,editor:"adjust" as const,assetId:"photo with spaces"};
 assert.equal(appRouteUrl(route),"/preview?editor=adjust&asset=photo%20with%20spaces");
 assert.deepEqual(readAppRoute(appRouteUrl(route)),route);
 const historyStack:{url:string;state:Record<string,unknown>}[]=[
   {url:"/images",state:{}},
 ];
 const stub={
   get state(){return historyStack.at(-1)!.state;},
   pushState(state:unknown,_unused:string,url?:string|URL|null){
     historyStack.push({url:String(url),state:state as Record<string,unknown>});
   },
   replaceState(state:unknown,_unused:string,url?:string|URL|null){
     historyStack[historyStack.length-1]={url:String(url),state:state as Record<string,unknown>};
   },
 };
 assert.equal(recordAppNavigation(stub,{view:"images"},route),true);
 assert.deepEqual(readAppRoute(historyStack[1].url),route);
 assert.deepEqual(readAppRoute(historyStack[0].url),{view:"images"});
});
