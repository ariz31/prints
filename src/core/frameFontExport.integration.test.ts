import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { exportToPdf } from "./exportPdf.ts";
import type { PhotoAsset } from "./exportPdf.ts";
import { fontCssName, loadLocalFonts } from "./fontAssets.ts";
import { validDesignLayers } from "./layers.ts";
import { assessPrintJob } from "./printPreflight.ts";
import { bundledFontById } from "./bundledFonts.ts";

const caption = { id:"caption", kind:"text" as const, name:"Caption", visible:true,
  x:.15, y:.2, width:.7, height:.25, color:"#123456", text:"Bonjour!", fontSizePt:12,
  bundledFontId:"pacifico" };
const frame = { id:"frame", kind:"frame" as const, name:"Frame", visible:true,
  x:0, y:0, width:1, height:1, color:"#a02020", frameId:"hearts", weight:1.5, opacity:.7 };
const asset:PhotoAsset={ id:"photo", name:"Photo", url:"blob:unused", pixelWidth:1200,
  pixelHeight:1200, crop:{x:0,y:0,width:1,height:1}, widthMm:50.8,heightMm:50.8,
  quantity:1, focalX:50,focalY:50,layers:[frame,caption] };
const pages=[{placements:[{itemId:"photo",copyIndex:0,xMm:5,yMm:5,widthMm:50.8,heightMm:50.8}]}];
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/n6sAAAAASUVORK5CYII=","base64");

test("bundled font and frame survive validation and export as embedded PDF content",async()=>{
  assert.equal(validDesignLayers(asset.layers),true);
  assert.equal(validDesignLayers([{...caption,bundledFontId:"missing"}]),false);
  assert.equal(validDesignLayers([{...caption,fontData:"data:font/ttf;base64,AAAA"}]),false);
  assert.equal(assessPrintJob([asset],pages,{widthMm:210,heightMm:297}).errors.length,0);
  const fontPath=bundledFontById("pacifico")!.path;
  const bytes=await readFile(new URL("../../public/"+fontPath,import.meta.url));
  const originalFetch=globalThis.fetch;
  const originalFace=Object.getOwnPropertyDescriptor(globalThis,"FontFace");
  const originalDoc=Object.getOwnPropertyDescriptor(globalThis,"document");
  let family="",loadedBytes=0,loads=0;
  class FakeFontFace {
    constructor(name:string,buffer:ArrayBuffer){family=name;loadedBytes=buffer.byteLength;}
    async load(){loads++;return this;}
  }
  try{
    globalThis.fetch=async(input)=>{
      assert.ok(String(input).endsWith(fontPath));
      return new Response(bytes);
    };
    Object.defineProperty(globalThis,"FontFace",{configurable:true,value:FakeFontFace});
    Object.defineProperty(globalThis,"document",{configurable:true,value:{fonts:{add(){}}}});
    await loadLocalFonts(asset.layers!);
    assert.equal(family,fontCssName(caption).slice(1,-1));
    assert.equal(loadedBytes,bytes.length);
    assert.equal(loads,1);
    const blob=await exportToPdf([asset],pages,{widthMm:210,heightMm:297},false,
      async()=>new Blob([new Uint8Array(png)],{type:"image/png"}));
    const pdf=await PDFDocument.load(await blob.arrayBuffer());
    const resources=pdf.getPage(0).node.Resources()!;
    const fonts=resources.lookup(PDFName.of("Font"),PDFDict);
    assert.ok(fonts.keys().some(key=>fonts.lookup(key,PDFDict).lookup(PDFName.of("Subtype"))===PDFName.of("Type0")),
      "PDF must include an embedded custom font, not a standard-font fallback");
  }finally{
    globalThis.fetch=originalFetch;
    if(originalFace)Object.defineProperty(globalThis,"FontFace",originalFace);
    else Reflect.deleteProperty(globalThis,"FontFace");
    if(originalDoc)Object.defineProperty(globalThis,"document",originalDoc);
    else Reflect.deleteProperty(globalThis,"document");
  }
});
