import assert from "node:assert/strict";
import test from "node:test";
import {referencedImageUrls} from "./referencedAssets.ts";
import {emptyHistory,pushHistory,travelHistory} from "./history.ts";
import type {PhotoAsset} from "./exportPdf.ts";

const item:PhotoAsset={
  id:"design-a",name:"Portrait",url:"blob:original",processedUrl:"blob:retouched",
  pixelWidth:1000,pixelHeight:1000,processedWidth:1000,processedHeight:1000,
  widthMm:25.4,heightMm:25.4,quantity:12,
  crop:{x:0,y:0,width:1,height:1},focalX:50,focalY:50,
  layers:[{kind:"text",id:"label",name:"Label",visible:true,
    x:0,y:0,width:0.7,height:0.2,color:"#000000",fontSizePt:8,text:"ID"}],
};

test("delete -> undo -> redo restores a design without losing its image bytes references",()=>{
  type Snapshot={items:PhotoAsset[]};
  const withImage:Snapshot={items:[item]};
  const deleted:Snapshot={items:[]};
  const before=pushHistory(emptyHistory<Snapshot>(),withImage);
  const restored=travelHistory(before,deleted,"undo")!;
  assert.deepEqual(restored.value.items,[item]);
  assert.deepEqual([...referencedImageUrls(restored.value.items,
    [...restored.history.undo,...restored.history.redo])].sort(),
    ["blob:original","blob:retouched"]);
  const deletedAgain=travelHistory(restored.history,restored.value,"redo")!;
  assert.deepEqual(deletedAgain.value.items,[]);
  assert.deepEqual([...referencedImageUrls(deletedAgain.value.items,
    [...deletedAgain.history.undo,...deletedAgain.history.redo])].sort(),
    ["blob:original","blob:retouched"]);
});

test("pending batch imports stay rooted until committed or canceled",()=>{
  const importing=new Set(["blob:pending-1","blob:pending-2"]);
  assert.deepEqual([...referencedImageUrls([],[],importing)].sort(),
    ["blob:pending-1","blob:pending-2"]);
  const committed=[{...item,url:"blob:pending-1",processedUrl:undefined}];
  importing.delete("blob:pending-1");
  assert.deepEqual([...referencedImageUrls(committed,[],importing)].sort(),
    ["blob:pending-1","blob:pending-2"]);
  importing.clear();
  assert.deepEqual([...referencedImageUrls(committed,[],importing)],["blob:pending-1"]);
  assert.deepEqual([...referencedImageUrls([],[],importing)],[]);
});

test("image URLs become collectible only after active and both history stacks release them",()=>{
  const unrelated={...item,id:"different",url:"blob:different",processedUrl:undefined};
  const currentlyLive=[unrelated];
  const refs=referencedImageUrls(currentlyLive,[{items:[item]}]);
  assert.equal(refs.has(item.url),true);
  assert.equal(refs.has(item.processedUrl!),true);
  assert.equal(refs.has(unrelated.url),true);
  const after=referencedImageUrls(currentlyLive,[]);
  assert.equal(after.has(item.url),false);
  assert.equal(after.has(item.processedUrl!),false);
  assert.equal(after.has(unrelated.url),true);
});
