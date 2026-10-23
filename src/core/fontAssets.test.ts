import assert from "node:assert/strict";
import test from "node:test";
import {decodeLocalFont,fontCssName,loadLocalFonts} from "./fontAssets.ts";
test("rejects non-font data and arbitrary browser URLs",()=>{
 assert.throws(()=>decodeLocalFont("https://malicious.example/font.ttf"),/Invalid/);
 assert.throws(()=>decodeLocalFont("data:font/ttf;base64,SGVsbG8="),/safe|Only valid/);
});
test("standard typography maps to known web font stacks",()=>{
 const layer={kind:"text" as const,id:"1",name:"a",visible:true,x:0,y:0,width:1,height:1,color:"#000000",text:"こんにちは",fontSizePt:12,fontFamily:"Courier" as const};
 assert.match(fontCssName(layer),/Courier/);
});

test("failed temporary FontFace load is retried instead of permanently cached",async()=>{
 const originalFace=Object.getOwnPropertyDescriptor(globalThis,"FontFace");
 const originalDoc=Object.getOwnPropertyDescriptor(globalThis,"document");
 let attempts=0,added=0;
 class FakeFontFace {
  constructor(_family:string,_bytes:ArrayBuffer) {}
  load():Promise<FakeFontFace>{
   attempts++;
   return attempts===1?Promise.reject(new Error("temporary browser font error")):
     Promise.resolve(this);
  }
 }
 try{
  Object.defineProperty(globalThis,"FontFace",{configurable:true,value:FakeFontFace});
  Object.defineProperty(globalThis,"document",{configurable:true,
   value:{fonts:{add(){added++;}}}});
  const data="data:font/ttf;base64,"+
   Buffer.from([0,1,0,0,0,0,0,0,0,0,0,0,91,92]).toString("base64");
  const layer={kind:"text" as const,id:"retry-test",name:"Test",
   x:.1,y:.1,width:.8,height:.2,visible:true,color:"#111111",
   text:"Name",fontSizePt:12,fontData:data};
  await assert.rejects(loadLocalFonts([layer]),/temporary browser font error/);
  await loadLocalFonts([layer]);
  await loadLocalFonts([layer]);
  assert.equal(attempts,2);
  assert.equal(added,1);
 }finally{
  if(originalFace)Object.defineProperty(globalThis,"FontFace",originalFace);
  else Reflect.deleteProperty(globalThis,"FontFace");
  if(originalDoc)Object.defineProperty(globalThis,"document",originalDoc);
  else Reflect.deleteProperty(globalThis,"document");
 }
});
