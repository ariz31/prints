import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {PDFDocument} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {BUNDLED_FONTS,bundledFontById,bundledFontCssName,bundledFontUrl,fetchBundledFont} from "./bundledFonts.ts";
import {firstUnsupportedBundledCharacter} from "./bundledFontCoverage.ts";

const sourceHashes:Record<string,string>={
  "lato":"0f3d0f837d24834b9b5b0a6b735459c56f5e75c3",
  "crimson-text":"6b474728a9a499233959959fb7d370df97733450",
  "abril-fatface":"e761f7b9c3c77290511fd87c296c8a3077d5db44",
  "pacifico":"27765d02ac13f241b1e207dbda7b2dd1b68280da",
};

test("catalog contains distinct, unmodified and redistributable local font files",async()=>{
  const worker=await readFile(new URL("../../public/sw.js",import.meta.url),"utf8");
  assert.equal(new Set(BUNDLED_FONTS.map(font=>font.id)).size,BUNDLED_FONTS.length);
  assert.deepEqual(new Set(BUNDLED_FONTS.map(font=>font.category)),
    new Set(["Sans serif","Serif","Display","Script"]));
  for(const font of BUNDLED_FONTS){
    const bytes=await readFile(new URL("../../public/"+font.path,import.meta.url));
    assert.equal(bytes.length,font.size);
    assert.ok(worker.includes(JSON.stringify("./"+font.path)),font.name+" must be in the offline shell");
    const blobHash=createHash("sha1").update("blob "+bytes.length+"\0").update(bytes).digest("hex");
    assert.equal(blobHash,sourceHashes[font.id]);
    assert.deepEqual([...bytes.subarray(0,4)],[0,1,0,0]);
    assert.equal(bundledFontById(font.id),font);
    assert.equal(bundledFontUrl(font.id,"/app/"),"/app/"+font.path);
    assert.match(bundledFontCssName(font.id),/^'prints-bundled-/);
  }
  assert.equal(bundledFontById("missing"),undefined);
  assert.throws(()=>bundledFontUrl("../outside"),/unknown bundled font/);
});

test("font downloads reject invalid responses and can be retried",async()=>{
  const originalFetch=globalThis.fetch;
  let attempts=0;
  const bytes=await readFile(new URL("../../public/"+bundledFontById("abril-fatface")!.path,import.meta.url));
  try{
    globalThis.fetch=async()=>{
      attempts++;
      return attempts===1?new Response("not a font",{status:200}):new Response(bytes);
    };
    await assert.rejects(fetchBundledFont("abril-fatface","/test-base/"),/incomplete or invalid/);
    assert.equal((await fetchBundledFont("abril-fatface","/test-base/")).length,bytes.length);
    await fetchBundledFont("abril-fatface","/test-base/");
    assert.equal(attempts,2);
  }finally{globalThis.fetch=originalFetch;}
});

test("each bundled font embeds successfully in a subset PDF",async()=>{
  for(const font of BUNDLED_FONTS){
    const bytes=await readFile(new URL("../../public/"+font.path,import.meta.url));
    const pdf=await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const embedded=await pdf.embedFont(bytes,{subset:true});
    const page=pdf.addPage([200,100]);
    page.drawText("Hello, world!",{font:embedded,size:12,x:10,y:40});
    assert.ok((await pdf.save()).length>1000,font.name+" should produce a PDF");
  }
});

test("bundled glyph coverage agrees with each distributed font's character map",async()=>{
  for(const font of BUNDLED_FONTS){
    const bytes=await readFile(new URL("../../public/"+font.path,import.meta.url));
    const actual=fontkit.create(bytes);
    const present=new Set(actual.characterSet.filter(cp=>actual.hasGlyphForCodePoint(cp)));
    for(let cp=0;cp<=0xffff;cp++){
      if(cp===10 || (cp>=0xd800&&cp<=0xdfff))continue;
      assert.equal(firstUnsupportedBundledCharacter(font.id,String.fromCodePoint(cp))===null,
        present.has(cp),font.id+" coverage mismatch at U+"+cp.toString(16));
    }
    assert.notEqual(firstUnsupportedBundledCharacter(font.id,"中"),null);
    assert.notEqual(firstUnsupportedBundledCharacter(font.id,"😀"),null);
  }
  assert.notEqual(firstUnsupportedBundledCharacter("crimson-text","Ж"),null);
  assert.equal(firstUnsupportedBundledCharacter("lato","Ж\nA"),null);
});
