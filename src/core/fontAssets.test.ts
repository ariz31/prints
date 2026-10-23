import assert from "node:assert/strict";
import test from "node:test";
import {decodeLocalFont,fontCssName} from "./fontAssets.ts";
test("rejects non-font data and arbitrary browser URLs",()=>{
 assert.throws(()=>decodeLocalFont("https://malicious.example/font.ttf"),/Invalid/);
 assert.throws(()=>decodeLocalFont("data:font/ttf;base64,SGVsbG8="),/safe|Only valid/);
});
test("standard typography maps to known web font stacks",()=>{
 const layer={kind:"text" as const,id:"1",name:"a",visible:true,x:0,y:0,width:1,height:1,color:"#000000",text:"こんにちは",fontSizePt:12,fontFamily:"Courier" as const};
 assert.match(fontCssName(layer),/Courier/);
});
