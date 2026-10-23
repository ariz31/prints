import assert from "node:assert/strict";
import test from "node:test";
import {createProjectZipArchive,readProjectZipArchive} from "./projectZipArchive.ts";
import type {StoredProject} from "./projectStore.ts";
const img=new Blob([new Uint8Array([137,80,78,71,13,10,26,10,1,2,3])],{type:"image/png"});
const original=new Blob([new Uint8Array([255,216,255,224,2,4,6,8])],{type:"image/jpeg"});
const base:StoredProject={schemaVersion:1,id:"saved",name:"Family IDs",updatedAt:"2026-10-23T12:00:00Z",
 settings:{paper:"A4",orientation:"portrait",customWidthMm:210,customHeightMm:297,
  marginMm:5,gapMm:3,cutGuides:true},
 assets:[
  {id:"id-1",name:"Photo A",widthMm:25.4,heightMm:25.4,quantity:4,
    pixelWidth:600,pixelHeight:600,crop:{x:0,y:0,width:1,height:1},
    focalX:50,focalY:50,original,processed:img},
  {id:"id-2",name:"Photo B",widthMm:50.8,heightMm:50.8,quantity:2,
    pixelWidth:600,pixelHeight:600,crop:{x:0,y:0,width:1,height:1},
    focalX:50,focalY:50,original,processed:img},
 ]};
test("portable ZIP round-trips independent variants and deduplicated originals",async()=>{
 const zipped=await createProjectZipArchive(base);
 assert.equal(zipped.type,"application/zip");
 const bytes=new Uint8Array(await zipped.arrayBuffer());
 assert.deepEqual(Array.from(bytes.slice(0,4)),[0x50,0x4b,3,4]);
 const text=new TextDecoder().decode(bytes);
 assert.equal((text.match(/image-000/g)||[]).length,3); // manifest + local + central directory
 const imported=await readProjectZipArchive(zipped);
 assert.notEqual(imported.id,base.id);
 assert.equal(imported.assets.length,2);
 assert.equal(imported.assets[0].original,imported.assets[1].original);
 assert.equal(imported.assets[0].crop?.width,1);
 assert.equal(imported.assets[1].widthMm,50.8);
 assert.deepEqual(Array.from(new Uint8Array(await imported.assets[0].original.arrayBuffer())),
  Array.from(new Uint8Array(await original.arrayBuffer())));
});
test("corruption and unsafe ZIP metadata cannot be imported",async()=>{
 const blob=await createProjectZipArchive(base);
 const bytes=new Uint8Array(await blob.arrayBuffer());
 const broken=new Uint8Array(bytes);broken[60]^=0x7f;
 await assert.rejects(readProjectZipArchive(new Blob([broken])),/CRC|ZIP|invalid|manifest/i);
 await assert.rejects(readProjectZipArchive(new Blob([new Uint8Array(22)])),/ZIP/i);
});

test("large embedded fonts survive deduplicated ZIP project transfers",async()=>{
 const fontData="data:font/ttf;base64,"+"A".repeat(1_200_000);
 const caption={id:"caption",name:"Name",kind:"text" as const,x:.1,y:.1,width:.8,height:.2,
  visible:true,color:"#000000",text:"José",fontSizePt:14,fontData,fontName:"Local font.ttf"};
 const project:StoredProject={...base,assets:[{...base.assets[0],layers:[caption]}]};
 const archive=await createProjectZipArchive(project);
 const imported=await readProjectZipArchive(archive);
 const layer=imported.assets[0].layers?.[0];
 assert.equal(layer?.kind,"text");
 if(layer?.kind!=="text")throw new Error("Text layer missing");
 assert.equal(layer.fontData?.length,fontData.length);
});

test("ZIP creation rejects spoofed JPEG, PNG and WebP payloads",async()=>{
 const fakeJpeg=new Blob([new Uint8Array([137,80,78,71,13,10,26,10,1,2,3])],{type:"image/jpeg"});
 const fakeWebp=new Blob([new Uint8Array([255,216,255,224,1,2,3,4,5,6,7,8])],{type:"image/webp"});
 await assert.rejects(createProjectZipArchive({...base,assets:[{...base.assets[0],original:fakeJpeg}]}),/signature/);
 await assert.rejects(createProjectZipArchive({...base,assets:[{...base.assets[0],original:fakeWebp}]}),/signature/);
});

test("ZIP parser refuses central-directory offsets that alias another entry",async()=>{
 const source=new Uint8Array(await (await createProjectZipArchive(base)).arrayBuffer());
 const tampered=new Uint8Array(source);
 const v=new DataView(tampered.buffer);
 const end=tampered.byteLength-22;
 const directory=v.getUint32(end+16,true);
 assert.equal(v.getUint32(directory,true),0x02014b50);
 // The next central entry points to the same physical bytes as manifest.json.
 const firstLen=46+v.getUint16(directory+28,true)+v.getUint16(directory+30,true)+v.getUint16(directory+32,true);
 const second=directory+firstLen;
 assert.equal(v.getUint32(second,true),0x02014b50);
 v.setUint32(second+42,0,true);
 await assert.rejects(readProjectZipArchive(new Blob([tampered])),/overlap|unindexed|mismatch|ZIP/);
});
