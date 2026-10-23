import { createElement } from "react";
import { readFile } from "node:fs/promises";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({
  logLevel: "error",
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
try {
  const mod = await server.ssrLoadModule("/src/App.tsx");
  const html = renderToString(createElement(mod.default));
  const markers = [
    "PRINTS", "Print setup", "Workspace", "Preview", "Images",
    "Print", "Add images", "Preferences"
  ];
  for (const marker of markers) {
    if (!html.includes(marker)) throw new Error("Missing app UI marker: " + marker);
  }
  if (html.length < 1500) throw new Error("Rendered application markup is unexpectedly short.");

  // Regression: source-order matches visual keyboard order. Every sidebar
  // disclosure retains a text label alongside its decorative Lucide icon.
  const sidebarStart=html.indexOf('<aside class="sidebar">');
  const sidebarEnd=html.indexOf("</aside>",sidebarStart);
  if(sidebarStart<0||sidebarEnd<0)throw new Error("Missing print sidebar.");
  const sidebar=html.slice(sidebarStart,sidebarEnd);
  const sectionOrder=["Print setup","Advanced settings","Layout presets","Workflows","Projects"];
  let last=-1;
  for(const section of sectionOrder){
    const at=sidebar.indexOf(section);
    if(at<=last)throw new Error("Unexpected sidebar reading/tab order: "+section);
    last=at;
  }
  for(const icon of ["lucide-printer","lucide-file-text","lucide-rectangle-vertical",
    "lucide-sliders-horizontal","lucide-layout-template","lucide-workflow","lucide-folder-open"]){
    if(!sidebar.includes(icon))throw new Error("Missing contextual sidebar icon: "+icon);
  }
  if((sidebar.match(/disclosure-chevron/g)||[]).length<4)
    throw new Error("Native details disclosures are missing Lucide expand indicators.");
  if(!sidebar.includes('aria-hidden="true"'))
    throw new Error("Decorative sidebar icons must be hidden from screen readers.");
  console.log("PRINTS icon/sidebar smoke passed; ordered sections",sectionOrder.length);

  // Both orientations have semantically correct, accessible decorative icons.
  const iconModule=await server.ssrLoadModule("/src/components/StudioIcon.tsx");
  for(const [name,className] of [
    ["portrait","lucide-rectangle-vertical"],
    ["orientation","lucide-rectangle-horizontal"],
    ["undo","lucide-undo-2"],["redo","lucide-redo-2"]
  ]){
    const output=renderToString(createElement(iconModule.default,{name}));
    if(!output.includes(className)||!output.includes('aria-hidden="true"'))
      throw new Error("Incorrect or nondecorative icon rendering: "+name);
  }

  // CSS regression for the specific horizontally scrolled, sub-320px print pane.
  const css=await readFile(new URL("../src/styles.css",import.meta.url),"utf8");
  for(const rule of ["body{min-width:0;margin:0}","@media(max-width:360px)",
    ".panel-heading .help-bubble{top:calc(100% + 7px)",
    ".disclosure-panel[open]>summary"]){
    if(!css.includes(rule))throw new Error("Missing sidebar responsive rule: "+rule);
  }

  // The dedicated editor must SSR safely and show the full source image by
  // default, not the cropped print-product preview.
  const editor=await server.ssrLoadModule("/src/components/PhotoAdjustEditor.tsx");
  const photoHtml=renderToString(createElement(editor.default,{
    item:{id:"editor-test",name:"Entire photo.png",url:"blob:photo-test",
      pixelWidth:2000,pixelHeight:1400,
      crop:{x:0.2,y:0.1,width:0.5,height:0.5},
      widthMm:50.8,heightMm:50.8,quantity:1,focalX:50,focalY:50,
      adjustments:{brightness:25,contrast:-10,saturation:30}},
    onApply:()=>{},onCancel:()=>{},
  }));
  for(const required of ["Entire photo","Print crop","Compare original",
    "photo-adjust-full-image","Brightness","Contrast","Color",
    "Apply changes","Edit photo"]){
    if(!photoHtml.includes(required))
      throw new Error("Missing dedicated photo editor marker: "+required);
  }
  const adjustmentCatalog=await server.ssrLoadModule("/src/core/photoAdjustments.ts");
  if(!("saturation" in adjustmentCatalog.PHOTO_CONTROLS)||
    !("denoise" in adjustmentCatalog.PHOTO_CONTROLS))
    throw new Error("Photo Studio adjustment category controls are missing.");
  if(!photoHtml.includes("Auto Enhance")||!photoHtml.includes("Portrait"))
    throw new Error("Photo Studio enhancement and presets are not rendered.");
  if(!photoHtml.includes("My saved photo styles") ||
    !photoHtml.includes("Save current style") ||
    !photoHtml.includes('aria-label="Apply saved photo style"'))
    throw new Error("Custom photo style controls must render in the dedicated editor.");
  const styleButtons=html=>html.slice(html.indexOf('aria-label="Photo style presets"'),
    html.indexOf('class="photo-studio-auto"'));
  if(!photoHtml.includes("Custom photo adjustments") ||
    styleButtons(photoHtml).includes('aria-pressed="true"'))
    throw new Error("Customized adjustments must not advertise an active style preset.");
  const neutralHtml=renderToString(createElement(editor.default,{
    item:{id:"style-test",name:"Unedited.png",url:"blob:photo-test",
      pixelWidth:800,pixelHeight:800,crop:{x:0,y:0,width:1,height:1},
      widthMm:50.8,heightMm:50.8,quantity:1,focalX:50,focalY:50,
      adjustments:{brightness:0,contrast:0,saturation:0}},
    onApply:()=>{},onCancel:()=>{},
  }));
  if(!neutralHtml.includes("Selected style: Original") ||
    !styleButtons(neutralHtml).includes('aria-pressed="true"'))
    throw new Error("An exact saved photo preset must visibly render as selected.");
  // Fixed-preview contract: editing controls are the ONLY mobile scrollport.
  // Verify both full/crop selectors and zoom stay outside the scrolling region.
  const previewStart=photoHtml.indexOf('class="photo-adjust-preview"');
  const scrollStart=photoHtml.indexOf('class="photo-adjust-controls"');
  if(previewStart<0||scrollStart<=previewStart ||
    !photoHtml.slice(previewStart,scrollStart).includes('aria-label="Preview zoom"') ||
    !photoHtml.slice(previewStart,scrollStart).includes("Print crop") ||
    !photoHtml.slice(scrollStart).includes('role="region"') ||
    !photoHtml.slice(scrollStart).includes('tabindex="0"'))
    throw new Error("Photo preview must remain separate from the keyboard-accessible scrollable adjustments.");

  for(const rule of [
    ".photo-adjust-route{height:100dvh;min-height:0;overflow:hidden;",
    ".photo-adjust-preview{display:flex;flex-direction:column;min-width:0;min-height:0;height:100%;overflow:hidden}",
    ".photo-adjust-preview-stage{position:relative;flex:1 1 auto;min-width:0;min-height:0;",
    "grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr)",
    ".photo-adjust-full-image{display:block;width:100%;height:100%;min-width:0;min-height:0;",
    ".photo-adjust-preview .warning{position:absolute;inset-inline:12px;top:12px;z-index:3;",
    "width:min(100%,570px,calc(100cqh * var(--photo-crop-ratio)))",
    "grid-template-rows:minmax(0,54%) minmax(0,46%)",
    ".photo-adjust-controls{max-height:none;min-height:0;overflow-y:auto;scrollbar-gutter:auto}"
  ]){
    if(!css.includes(rule))throw new Error("Photo Studio fixed-preview sizing or independent scroll missing: "+rule);
  }
  if(css.includes(".photo-adjust-controls{max-height:none;overflow:visible}"))
    throw new Error("Mobile Photo Studio must not scroll the preview with its controls.");
  console.log("PRINTS fixed Photo Studio preview and independent mobile scroll smoke passed.");
  if(!photoHtml.includes("brightness(1.25)"))
    throw new Error("Photo editor did not apply saved adjustments to the full-photo preview.");
  // Compact mobile slider controls have no redundant min/mid/max tick row.
  // The current numeric output, native range bounds, and reset action remain.
  if(photoHtml.includes("photo-adjust-ticks"))
    throw new Error("Photo Studio still renders the redundant bottom slider scales.");
  for(const [field,min,max] of [
    ["brightness",-100,100],["contrast",-100,100],["exposure",-200,200],
    ["highlights",-100,100],["shadows",-100,100],["whites",-100,100]
  ]){
    const id='id="photo-adjust-'+field+'"';
    if(!photoHtml.includes(id)||!photoHtml.includes('min="'+min+'" max="'+max+'"')||
      !photoHtml.includes('Reset '+field[0].toUpperCase()+field.slice(1)))
      throw new Error("Photo Studio lost its accessible "+field+" range or reset control.");
  }
  // React may insert an SSR text-node separator between the sign and number.
  if(!/<output\b[^>]*>\+(?:<!-- -->)?25<\/output>/.test(photoHtml))
    throw new Error("Photo Studio lost its current slider value display.");
  for(const cssRule of [".photo-adjust-control{padding:10px 0",
      "margin-bottom:6px;font-weight:600}"]){
    if(!css.includes(cssRule))throw new Error("Photo Studio slider layout lost compact spacing.");
  }
  // Regression: opening Design Layers on a phone must not let the source
  // image's intrinsic width push the Close button offscreen. The dedicated
  // editor uses a constrained, aspect-ratio-preserving stage.
  const layersEditor=await server.ssrLoadModule("/src/components/LayerPanel.tsx");
  const layersHtml=renderToString(createElement(layersEditor.default,{
    item:{id:"layers-mobile",name:"a-very-long-filename-without-spaces.jpg",
      url:"blob:source-image",pixelWidth:4032,pixelHeight:3024,
      crop:{x:0,y:0,width:1,height:1},widthMm:50.8,heightMm:76.2,
      quantity:1,focalX:50,focalY:50,layers:[]},
    previewUrl:"blob:print-crop",onChange:()=>{},onClose:()=>{},
  }));
  for(const marker of ['class="layers-editor"','class="layer-canvas"',
    'class="layer-canvas-photo"','aria-label="Close design layers editor"',
    'class="layer-toolbar-description"','--design-ratio:']){
    if(!layersHtml.includes(marker))
      throw new Error("Missing constrained design-layers editor element: "+marker);
  }
  for(const rule of [".layers-editor-route{width:100%;min-width:0",
    "grid-template-columns:minmax(0,1fr)","width:min(100%,680px,calc(67dvh * var(--design-ratio)))",
    ".layer-canvas-photo{position:absolute;inset:0;width:100%;height:100%",
    ".layers-editor .layer-controls{grid-template-columns:repeat(2,minmax(0,1fr))"]){
    if(!css.includes(rule))throw new Error("Missing responsive design-layers constraint: "+rule);
  }
  const appSource=await readFile(new URL("../src/App.tsx",import.meta.url),"utf8");
  // A multi-file import holds decoded URLs before the final workspace commit.
  // The reference collector must never revoke that in-flight source.
  for(const marker of ["pendingImportUrls.current.add(url)",
    "pendingImportUrls.current.delete(asset.url)",
    "[...history.current.undo, ...history.current.redo],pendingImportUrls.current)",
    "onRestoreOriginal={()=>{"]){
    if(!appSource.includes(marker))
      throw new Error("Image source lifetime/recovery guard missing: "+marker);
  }
  const photoSource=await readFile(new URL("../src/components/PhotoAdjustEditor.tsx",import.meta.url),"utf8");
  for(const marker of ["photoSourceFailureMode(item,url,sourceMode)",
    "Restore original for this design","Retry image",
    "disabled={!changed||compareOriginal||!sourceIsUsable}",
    "onError={()=>previewFailed(previewSrc,true)}",
    "onError={()=>previewFailed(src,false)}",
    "const loaded=loadedImageKey===visibleImageKey",
    "(!needsRender||previewActive)",
    "(sourceUnavailable||rasterFailed||originalFallback)"]){
    if(!photoSource.includes(marker))
      throw new Error("Photo Studio source recovery/preview integrity guard missing: "+marker);
  }
  if(!css.includes(".photo-adjust-recovery{position:absolute;bottom:12px;"))
    throw new Error("Source recovery actions must remain inside the fixed preview.");
  console.log("PRINTS photo image-source lifetime and recovery smoke passed.");
  if(!appSource.includes('if(editingLayers)return <main className="layers-editor-route"'))
    throw new Error("Design Layers must open outside the workspace and mobile tabs.");
  console.log("PRINTS responsive Design Layers editor smoke passed.");
  // Exercise zero-valued controls through React SSR as well as pure geometry
  // tests. Nothing in the control tree should throw or divide by zero.
  const zeroScreens=[
    ["/src/components/DimensionField.tsx",
      {label:"Margin",valueMm:0,unit:"mm",minMm:0,maxMm:1999.999,onCommit:()=>{}}],
    ["/src/components/BoundedNumberField.tsx",
      {label:"X (%)",value:0,min:0,max:100,integer:true,onCommit:()=>{}}],
    ["/src/components/WorkflowNumberInput.tsx",
      {name:"marginMm",value:0,onCommit:()=>{}}],
    ["/src/components/PhotoAdjustEditor.tsx",
      {item:{id:"zero-tone",name:"Neutral.png",url:"blob:neutral",
        pixelWidth:400,pixelHeight:400,crop:{x:0,y:0,width:1,height:1},
        widthMm:50.8,heightMm:50.8,quantity:1,focalX:0,focalY:0,
        adjustments:{brightness:0,contrast:0,saturation:0}},
       onApply:()=>{},onCancel:()=>{}}],
  ];
  for(const [componentPath,props] of zeroScreens){
    const module=await server.ssrLoadModule(componentPath);
    const zeroHtml=renderToString(createElement(module.default,props));
    if(!zeroHtml||zeroHtml.length<80)
      throw new Error("Empty zero-value UI for "+componentPath);
    if(!zeroHtml.includes("0"))
      throw new Error("Zero value was lost rendering "+componentPath);
  }
  console.log("PRINTS zero-value input UI smoke passed;",zeroScreens.length,"components");
  console.log("PRINTS photo editor render smoke passed; HTML size",photoHtml.length);
    console.log("PRINTS application render smoke passed; HTML size", html.length);
} finally {
  await server.close();
}
