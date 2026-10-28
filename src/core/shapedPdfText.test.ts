import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import fontkit from "@pdf-lib/fontkit";
import {PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream, rgb} from "pdf-lib";
import {bundledFontById} from "./bundledFonts.ts";
import {exportToPdf} from "./exportPdf.ts";
import type {PhotoAsset} from "./exportPdf.ts";
import {makeShapedPdfPainter,shapePdfLine} from "./shapedPdfText.ts";

async function fontBytes(id:string){
  const font=bundledFontById(id);
  assert.ok(font);
  return readFile(new URL("../../public/"+font.path,import.meta.url));
}

test("PDF glyph positions follow kerning and retain whole-run ligatures",async()=>{
  const bytes=await fontBytes("abril-fatface");
  const source=fontkit.create(bytes);
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const embedded=await pdf.embedFont(bytes,{subset:true});
  const size=12,text="AVATAR office", fontRun=source.layout(text);
  const line=shapePdfLine(embedded,source,text,size);
  const expected=fontRun.positions.reduce((sum,p)=>sum+p.xAdvance,0)*size/source.unitsPerEm;
  assert.ok(Math.abs(line.width-expected)<1e-8);
  assert.ok(embedded.widthOfTextAtSize(text,size)-line.width>2,
    "the regression fixture must contain meaningful kerning");
  assert.equal(line.glyphs.length,fontRun.glyphs.length);
  assert.ok(line.glyphs.length<[...text].length,"font substitution should preserve the fi/ffi ligature");
  assert.ok(Math.abs(line.glyphs[1].x-fontRun.positions[0].xAdvance*size/source.unitsPerEm)<1e-8);
  assert.throws(()=>shapePdfLine(embedded,source,"A中",size),/cannot display.*U\+4E2D/);
});

test("painted PDF retains positioned subset glyphs, color and opacity",async()=>{
  const bytes=await fontBytes("abril-fatface");
  const source=fontkit.create(bytes),pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const embedded=await pdf.embedFont(bytes,{subset:true}),page=pdf.addPage([200,200]);
  const line=shapePdfLine(embedded,source,"AVATAR",12);
  makeShapedPdfPainter(page,embedded,12,.42)(line,20,100,rgb(.2,.3,.4));
  const reopened=await PDFDocument.load(await pdf.save());
  const savedPage=reopened.getPage(0);
  const contents=savedPage.node.Contents();
  const stream=contents instanceof PDFArray?contents.lookup(0,PDFRawStream):contents;
  assert.ok(stream instanceof PDFRawStream);
  const content=new TextDecoder().decode(decodePDFRawStream(stream).decode());
  assert.match(content,/0\.2 0\.3 0\.4 rg/);
  assert.match(content,/1 0 0 1 20 100 Tm/);
  assert.equal((content.match(/ TJ/g)||[]).length,1,"a horizontal glyph run uses one operator");
  assert.equal((content.match(/ Tm/g)||[]).length,1);
  const adjustment=(line.glyphs[0].x+line.glyphs[0].advance-line.glyphs[1].x)*1000/12;
  assert.ok(content.includes(PDFNumber.of(adjustment).toString()),"kerning adjustment must appear in TJ");
  const states=savedPage.node.Resources()!.lookup(PDFName.of("ExtGState"),PDFDict);
  const gs=states.lookup(states.keys()[0],PDFDict);
  assert.equal(gs.lookup(PDFName.of("ca"),PDFNumber).asNumber(),.42);
});

test("long text and repeated outline passes remain compact PDF text runs",async()=>{
  const bytes=await fontBytes("abril-fatface"),source=fontkit.create(bytes);
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const font=await pdf.embedFont(bytes,{subset:true}),page=pdf.addPage([1000,1000]);
  const line=shapePdfLine(font,source,"AVATAR ".repeat(40),12);
  const paint=makeShapedPdfPainter(page,font,12,1);
  for(let pass=0;pass<10;pass++)paint(line,10+pass,500,rgb(0,0,0));
  const reopened=await PDFDocument.load(await pdf.save()),contents=reopened.getPage(0).node.Contents();
  const stream=contents instanceof PDFArray?contents.lookup(0,PDFRawStream):contents;
  assert.ok(stream instanceof PDFRawStream);
  const content=new TextDecoder().decode(decodePDFRawStream(stream).decode());
  assert.equal((content.match(/ TJ/g)||[]).length,10);
  assert.equal((content.match(/ Tm/g)||[]).length,10);
});

test("a combining mark with a vertical offset gets a separate positioned run",async()=>{
  const bytes=await fontBytes("lato"),source=fontkit.create(bytes);
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  const font=await pdf.embedFont(bytes,{subset:true}),page=pdf.addPage([100,100]);
  const line=shapePdfLine(font,source,"A\u030a",14);
  assert.ok(line.glyphs.some(glyph=>glyph.y!==0),"fixture must use a vertical positioning adjustment");
  makeShapedPdfPainter(page,font,14,1)(line,10,50,rgb(0,0,0));
  const reopened=await PDFDocument.load(await pdf.save()),contents=reopened.getPage(0).node.Contents();
  const stream=contents instanceof PDFArray?contents.lookup(0,PDFRawStream):contents;
  assert.ok(stream instanceof PDFRawStream);
  const content=new TextDecoder().decode(decodePDFRawStream(stream).decode());
  assert.equal((content.match(/ TJ/g)||[]).length,2);
  assert.equal((content.match(/ Tm/g)||[]).length,2);
});

test("full PDF export uses shaped width and refuses missing included-font glyphs",async()=>{
  const bytes=await fontBytes("abril-fatface"),font=bundledFontById("abril-fatface")!;
  const originalFetch=globalThis.fetch;
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/n6sAAAAASUVORK5CYII=","base64");
  const caption={id:"text",kind:"text" as const,name:"Text",visible:true,color:"#000000",
    x:.1,y:.1,width:47/144,height:.3,text:"AVATAR",fontSizePt:12,bundledFontId:font.id,
    align:"center" as const,opacity:.7,shadowPt:1,outlinePt:1};
  const asset:PhotoAsset={id:"photo",name:"Photo",url:"blob:test",pixelWidth:1200,pixelHeight:1200,
    crop:{x:0,y:0,width:1,height:1},widthMm:50.8,heightMm:50.8,quantity:1,focalX:50,focalY:50,layers:[caption]};
  const pages=[{placements:[{itemId:"photo",copyIndex:0,xMm:0,yMm:0,widthMm:50.8,heightMm:50.8}]}];
  const mock=async()=>new Blob([new Uint8Array(png)],{type:"image/png"});
  try{
    globalThis.fetch=async input=>{
      assert.ok(String(input).endsWith(font.path));return new Response(bytes);
    };
    const blob=await exportToPdf([asset],pages,{widthMm:50.8,heightMm:50.8},false,mock);
    assert.ok(blob.size>1000,"kerning-aware text should fit the 47 pt box");
    await assert.rejects(exportToPdf([{...asset,layers:[{...caption,text:"中"}]}],pages,
      {widthMm:50.8,heightMm:50.8},false,mock),/cannot display.*U\+4E2D/);
  }finally{globalThis.fetch=originalFetch;}
});
