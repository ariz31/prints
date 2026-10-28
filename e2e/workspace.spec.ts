import {test,expect} from "@playwright/test";
import type {Page,TestInfo} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {existsSync} from "node:fs";
import {PDFDocument} from "pdf-lib";

async function captureExports(page:Page){
 await page.addInitScript(()=>{
  const blobs=new Map<string,Blob>();
  const captured:Array<{name:string;blob:Blob}>=[];
  const originalCreate=URL.createObjectURL.bind(URL);
  URL.createObjectURL=((value:Blob|MediaSource)=>{
   const url=originalCreate(value);
   if(value instanceof Blob)blobs.set(url,value);
   return url;
  }) as typeof URL.createObjectURL;
  const originalClick=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){
   const blob=blobs.get(this.href);
   if(this.download&&blob){captured.push({name:this.download,blob});return;}
   originalClick.call(this);
  };
  Object.defineProperty(globalThis,"__printsCapturedExports",{value:captured,configurable:true});
 });
}
async function capturedExport(page:Page,suffix:string){
 return page.evaluate(async suffix=>{
  const entries=(globalThis as typeof globalThis & {
   __printsCapturedExports?:Array<{name:string;blob:Blob}>
  }).__printsCapturedExports??[];
  const found=[...entries].reverse().find(entry=>entry.name.endsWith(suffix));
  if(!found)return null;
  return {name:found.name,type:found.blob.type,
   bytes:Array.from(new Uint8Array(await found.blob.arrayBuffer()))};
 },suffix);
}
async function images(page:Page){
 const tab=page.getByRole("navigation",{name:"Mobile workspace navigation"}).getByRole("button",{name:"Images",exact:true});
 if(await tab.isVisible())await tab.click();
}
async function importPhoto(page:Page){
 await page.goto("/");
 await page.getByLabel("Upload image files").setInputFiles("e2e/fixtures/landscape.png");
 await expect(page.locator(".asset-card")).toHaveCount(1);
 await images(page);
}
async function bounded(page:Page,editor=false){
 const geometry=await page.evaluate(()=>{
  const w=innerWidth,h=innerHeight;
  const overflow=[...document.querySelectorAll<HTMLElement>("body *")].map(node=>{
   const r=node.getBoundingClientRect();
   return {tag:node.tagName.toLowerCase(),className:String(node.className||"").slice(0,160),
    left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width)};
  }).filter(item=>item.right>w+1||item.left<-1).sort((a,b)=>b.right-a.right).slice(0,12);
  return {w,h,dw:document.documentElement.scrollWidth,dh:document.documentElement.scrollHeight,overflow,
   stage:(document.querySelector(".editor-canvas-area,.photo-adjust-preview-stage,.sheet") as HTMLElement)?.getBoundingClientRect().toJSON(),
   inspector:(document.querySelector(".editor-inspector,.photo-adjust-controls") as HTMLElement)?.getBoundingClientRect().toJSON()};
 });
 if(geometry.dw>geometry.w+1)console.log("viewport-overflow",JSON.stringify(geometry.overflow));
 expect(geometry.dw).toBeLessThanOrEqual(geometry.w+1);expect(geometry.dh).toBeLessThanOrEqual(geometry.h+1);
 if(geometry.stage){expect(geometry.stage.width).toBeGreaterThan(40);expect(geometry.stage.height).toBeGreaterThan(40);
  expect(geometry.stage.x).toBeGreaterThanOrEqual(-1);expect(geometry.stage.y).toBeGreaterThanOrEqual(-1);
  expect(geometry.stage.right).toBeLessThanOrEqual(geometry.w+1);expect(geometry.stage.bottom).toBeLessThanOrEqual(geometry.h+1);}
 if(editor){expect(geometry.inspector).toBeTruthy();expect(geometry.inspector.bottom).toBeLessThanOrEqual(geometry.h+1);}
}
async function visual(page:Page,info:TestInfo,name:string){
 if(existsSync(info.snapshotPath(name)))await expect(page).toHaveScreenshot(name,{animations:"disabled"});
 else await page.screenshot({path:info.outputPath(name),animations:"disabled"});
}
test("workspace retains sheet when properties open and all editor layouts stay within viewport",async({page},info)=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await importPhoto(page);await bounded(page);
 for(const name of ["Crop","Edit photo","Background","ID Photo Studio","Frames & text (0)"]){
  await page.getByRole("button",{name,exact:true}).click();
  await expect(page.locator(".editor-workspace,.photo-adjust-route")).toBeVisible();
  await bounded(page,true);
  if(name==="Frames & text (0)")await visual(page,info,"layers-workspace.png");
  if(name==="Crop"){
   await expect(page.getByRole("button",{name:"Apply crop",exact:true})).toBeEnabled();
   const before=await page.locator(".editor-canvas-area").boundingBox();
   await page.locator(".editor-inspector").evaluate(e=>e.scrollTop=e.scrollHeight);
   expect(await page.locator(".editor-canvas-area").boundingBox()).toEqual(before);
  }
  await page.getByRole("button",{name:name==="Edit photo"?"Cancel photo adjustments and return to workspace":"Cancel",exact:true}).click();
  await images(page);
 }
 expect(errors).toEqual([]);
 await visual(page,info,"print-workspace.png");
 info.annotations.push({type:"acceptance",description:"Emulated Chromium viewport; real hardware acceptance remains separate."});
});
test("crop drafts cancel safely, apply as one workspace transaction and undo locally",async({page})=>{
 await importPhoto(page);await page.getByRole("button",{name:"Crop",exact:true}).click();
 const apply=page.getByRole("button",{name:"Apply crop",exact:true});await expect(apply).toBeEnabled();
 const zoom=page.getByRole("slider");await zoom.press("End");await expect(apply).toBeEnabled();
 await expect(page.getByRole("button",{name:"Undo edit",exact:true})).toBeEnabled();
 await page.getByRole("button",{name:"Undo edit",exact:true}).click();await expect(zoom).toHaveValue("1");
 await page.getByRole("button",{name:"Redo edit",exact:true}).click();await expect(zoom).toHaveValue("8");
 await page.getByRole("button",{name:"Cancel",exact:true}).click();await images(page);
 await page.getByRole("button",{name:"Crop",exact:true}).click();await expect(zoom).toHaveValue("1");
 await zoom.press("End");await expect(apply).toBeEnabled();await apply.click();await images(page);
 await page.getByRole("button",{name:"Crop",exact:true}).click();await expect(zoom).toHaveValue("8");
 await page.getByRole("button",{name:"Cancel",exact:true}).click();
 await page.getByRole("button",{name:"Undo edit",exact:true}).click();await images(page);
 await page.getByRole("button",{name:"Crop",exact:true}).click();await expect(zoom).toHaveValue("1");
});
test("frame galleries, inline color and layer transactions preserve cancel and apply",async({page})=>{
 await importPhoto(page);await page.getByRole("button",{name:"Frames & text (0)",exact:true}).click();
 for(const category of ["Minimal","Classic","Geometric","Botanical","Celebratory"]){
  await page.getByRole("button",{name:category,exact:true}).click();await expect(page.locator(".frame-option")).toHaveCount(6);
 }
 await page.getByRole("button",{name:"Apply Hearts frame",exact:true}).click();
 await page.getByRole("textbox",{name:"Color HEX",exact:true}).fill("#12abef");
 await page.getByRole("textbox",{name:"Color HEX",exact:true}).press("Tab");
 const inset=page.getByRole("spinbutton",{name:"Frame inset (% short side)",exact:true});await inset.fill("12");await inset.press("Tab");
 // Pointer-up must commit the *visible* snapped preview, not stale React state.
 await page.getByRole("button",{name:"+ Rectangle",exact:true}).click();
 const movedLayer=page.locator(".layer-canvas-object").first();
 const layerBox=await movedLayer.boundingBox();
 expect(layerBox).toBeTruthy();
 const originalLeft=await movedLayer.evaluate(node=>node.style.left);
 await page.mouse.move(layerBox!.x+layerBox!.width/2,layerBox!.y+layerBox!.height/2);
 await page.mouse.down();
 await page.mouse.move(layerBox!.x+layerBox!.width/2+24,layerBox!.y+layerBox!.height/2);
 await expect.poll(()=>movedLayer.evaluate(node=>node.style.left)).not.toBe(originalLeft);
 const previewedLeft=await movedLayer.evaluate(node=>node.style.left);
 await page.mouse.up();
 await expect.poll(()=>movedLayer.evaluate(node=>node.style.left)).toBe(previewedLeft);
 await bounded(page,true);await page.getByRole("button",{name:"Cancel",exact:true}).click();await images(page);
 await page.getByRole("button",{name:"Frames & text (0)",exact:true}).click();
 await page.getByRole("button",{name:"Apply Hairline frame",exact:true}).click();
 await page.getByRole("button",{name:"Apply changes",exact:true}).click();await images(page);
 await expect(page.getByRole("button",{name:"Frames & text (1)",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Undo edit",exact:true}).click();await images(page);
 await expect(page.getByRole("button",{name:"Frames & text (0)",exact:true})).toBeVisible();
});
test("export dialog produces physical 300-DPI PNG and correctly sized PDF",async({page})=>{
 await captureExports(page);
 await importPhoto(page);await page.getByRole("button",{name:"Export & print",exact:true}).click();
 const dialog=page.getByRole("dialog");
 await expect(dialog).toBeVisible();await bounded(page);
 await dialog.getByRole("combobox",{name:"Format",exact:true}).selectOption("png");
 await page.getByRole("button",{name:"Export PNG",exact:true}).evaluate(node=>(node as HTMLButtonElement).click());
 await expect(dialog.getByRole("status").filter({hasText:"Finished PNG downloaded"})).toBeVisible({timeout:15_000});
 const pngCapture=await capturedExport(page,".png");expect(pngCapture).toBeTruthy();
 const png=Uint8Array.from(pngCapture!.bytes),view=new DataView(png.buffer,png.byteOffset,png.byteLength);
 expect(pngCapture!.type).toBe("image/png");
 expect(view.getUint32(16)).toBe(600);expect(view.getUint32(20)).toBe(600);
 let density=false;for(let i=8;i<png.length;){const length=view.getUint32(i),type=String.fromCharCode(...png.slice(i+4,i+8));
  if(type==="pHYs"){expect(view.getUint32(i+8)).toBe(Math.round(300*1000/25.4));density=true;}i+=length+12;}
 expect(density).toBe(true);
 await expect(dialog.getByRole("combobox",{name:"Format",exact:true})).toBeEnabled();await dialog.getByRole("combobox",{name:"Format",exact:true}).selectOption("pdf");
 await page.getByRole("button",{name:"Export PDF",exact:true}).evaluate(node=>(node as HTMLButtonElement).click());
 await expect(dialog.getByRole("status").filter({hasText:"sheet(s) exported"})).toBeVisible({timeout:15_000});
 const pdfCapture=await capturedExport(page,".pdf");expect(pdfCapture).toBeTruthy();
 expect(pdfCapture!.type).toBe("application/pdf");
 const pdf=await PDFDocument.load(Uint8Array.from(pdfCapture!.bytes));
 expect(pdf.getPageCount()).toBe(1);expect(pdf.getPage(0).getWidth()).toBeCloseTo(210/25.4*72,5);expect(pdf.getPage(0).getHeight()).toBeCloseTo(297/25.4*72,5);
 // Export path must actually download a structurally valid ZIP containing
 // the original exported PNG, not merely pass the pure archive writer tests.
 await dialog.getByRole("combobox",{name:"Format",exact:true}).selectOption("zip");
 await page.getByRole("button",{name:"Export ZIP",exact:true}).click();
 await expect(dialog.getByRole("status").filter({hasText:"Downloaded 1 finished designs"})).toBeVisible({timeout:20_000});
 const zipCapture=await capturedExport(page,".zip");
 expect(zipCapture).toBeTruthy();expect(zipCapture!.type).toBe("application/zip");
 const zip=Uint8Array.from(zipCapture!.bytes);
 const zipView=new DataView(zip.buffer);
 expect(zipView.getUint32(0,true)).toBe(0x04034b50);
 expect(zipView.getUint32(zip.byteLength-22,true)).toBe(0x06054b50);
 expect(zipView.getUint16(zip.byteLength-12,true)).toBe(1);
 const nameLength=zipView.getUint16(26,true);
 const fileName=new TextDecoder().decode(zip.subarray(30,30+nameLength));
 expect(fileName).toMatch(/^01-.*\\.png$/);
 const start=30+nameLength;
 expect(Array.from(zip.subarray(start,start+8))).toEqual([137,80,78,71,13,10,26,10]);
});

test("critical accessibility rules pass in workspace and frame editor",async({page})=>{
 await importPhoto(page);
 for(const editor of [false,true]){
  if(editor)await page.getByRole("button",{name:"Frames & text (0)",exact:true}).click();
  const result=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();
  expect(result.violations.filter(v=>v.impact==="critical"||v.impact==="serious")).toEqual([]);
 }
});

test("saved original photo survives refresh, reopen and thumbnail regeneration",async({page})=>{
 await importPhoto(page);
 const mobileNav=page.getByRole("navigation",{name:"Mobile workspace navigation"});
 const printTab=mobileNav.getByRole("button",{name:"Print",exact:true});
 if(await printTab.isVisible())await printTab.click();
 const projects=page.locator(".sidebar details.disclosure-panel").filter({
  has:page.getByText("Projects",{exact:true}),
 }).first();
 await projects.locator("summary").first().click();
 await projects.getByRole("textbox",{name:"Project name"}).fill("QA durable print");
 await projects.getByRole("button",{name:"Save full project"}).click();
 await expect(page.getByText("Project saved locally",{exact:false})).toBeVisible();
 await page.reload();
 if(await printTab.isVisible())await printTab.click();
 const reopened=page.locator(".sidebar details.disclosure-panel").filter({
  has:page.getByText("Projects",{exact:true}),
 }).first();
 await reopened.locator("summary").first().click();
 const saved=reopened.getByRole("combobox",{name:"Open an existing project"});
 await expect(saved.locator("option")).toContainText(["Select saved project","QA durable print (1 images)"]);
 await saved.selectOption({label:"QA durable print (1 images)"});
 await reopened.getByRole("button",{name:"Open selected project"}).click();
 await expect(page.getByText("Saved project reopened",{exact:false})).toBeVisible();
 await images(page);
 await expect(page.locator(".asset-card")).toHaveCount(1);
 await expect.poll(async()=>page.locator(".asset-thumbnail").first().evaluate(node=>
  node instanceof HTMLImageElement && node.complete && node.naturalWidth>0
 )).toBe(true);
 const previewTab=mobileNav.getByRole("button",{name:"Preview",exact:true});
 if(await previewTab.isVisible())await previewTab.click();
 await bounded(page);
});

test("canceling a frame edit preserves identical printed sheet pixels",async({page})=>{
 await importPhoto(page);
 const mobileNav=page.getByRole("navigation",{name:"Mobile workspace navigation"});
 const previewTab=mobileNav.getByRole("button",{name:"Preview",exact:true});
 if(await previewTab.isVisible())await previewTab.click();
 const sheet=page.locator(".sheet").first();
 await expect(sheet).toBeVisible();
 await expect.poll(async()=>sheet.locator("img").first().evaluate(node=>
  node instanceof HTMLImageElement && node.complete && node.naturalWidth>0
 )).toBe(true);
 const before=await sheet.screenshot({animations:"disabled"});
 await images(page);
 await page.getByRole("button",{name:"Frames & text (0)",exact:true}).click();
 await page.getByRole("button",{name:"Celebratory",exact:true}).click();
 await page.getByRole("button",{name:"Apply Hearts frame",exact:true}).click();
 await page.getByRole("button",{name:"Cancel",exact:true}).click();
 if(await previewTab.isVisible())await previewTab.click();
 await expect(sheet).toBeVisible();
 const after=await sheet.screenshot({animations:"disabled"});
 expect(after.equals(before)).toBe(true);
});
