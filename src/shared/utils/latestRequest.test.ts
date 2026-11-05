import test from "node:test";
import assert from "node:assert/strict";
import {LatestRequest} from "./latestRequest.ts";

test("a canceled analysis cannot commit or clear a later analysis busy flag",async()=>{
 const requests=new LatestRequest();
 const first=requests.begin();
 requests.cancel(); // User moves a slider after analysis A starts.
 const newer=requests.begin(); // User requests analysis B.
 assert.equal(requests.isCurrent(first),false);
 assert.equal(requests.isCurrent(newer),true);
 let busy=true;
 let completeFirst!:()=>void;
 const oldAnalysis=new Promise<void>(resolve=>{completeFirst=resolve;});
 const pending=(async()=>{await oldAnalysis;
   if(requests.isCurrent(first))busy=false;
 })();
 completeFirst();await pending;
 assert.equal(busy,true);
 if(requests.isCurrent(newer))busy=false;
 assert.equal(busy,false);
});
test("navigation cancels all pending edits",()=>{
 const requests=new LatestRequest();
 const analysis=requests.begin();
 requests.cancel();
 assert.equal(requests.isCurrent(analysis),false);
});
