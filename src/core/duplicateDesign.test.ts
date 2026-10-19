import assert from "node:assert/strict";
import test from "node:test";
import {canRevokeImageUrl,duplicatePrintDesign} from "./duplicateDesign.ts";
import type { PhotoAsset } from "./exportPdf.ts";
const input:PhotoAsset={id:"original",name:"id-photo.jpg",url:"blob:image",pixelWidth:1000,
 pixelHeight:1000,crop:{x:.1,y:.1,width:.8,height:.8},widthMm:25.4,heightMm:25.4,
 quantity:8,focalX:50,focalY:50,
 layers:[{id:"label",name:"Name",kind:"text",visible:true,
  x:.05,y:.1,width:.8,height:.2,color:"#000000",fontSizePt:8,text:"ID"}]};
test("copies independently editable cropping and printable design layers",()=>{
 const copy=duplicatePrintDesign(input,"new",["new-label"]);
 assert.equal(copy.url,input.url);
 assert.equal(copy.name,"id-photo copy.jpg");
 assert.equal(copy.id,"new");
 assert.equal(copy.layers?.[0].id,"new-label");
 copy.crop.x=.3;
 assert.equal(input.crop.x,.1);
 assert.equal(input.layers?.[0].id,"label");
});
test("shared source bytes stay alive until all product designs release them",()=>{
 const copy=duplicatePrintDesign(input,"new",["new-label"]);
 assert.equal(canRevokeImageUrl(input.url,[copy]),false);
 assert.equal(canRevokeImageUrl(input.url,[]),true);
});
test("invalid layer IDs reject unsafe duplicates",()=>{
 assert.throws(()=>duplicatePrintDesign(input,"original",["other"]),/Invalid/);
 assert.throws(()=>duplicatePrintDesign(input,"new",[]),/Invalid/);
});
