import { createElement } from "react";
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
  for(const icon of ["lucide-printer","lucide-file-text","lucide-rectangle-horizontal",
    "lucide-sliders-horizontal","lucide-layout-template","lucide-workflow","lucide-folder-open"]){
    if(!sidebar.includes(icon))throw new Error("Missing contextual sidebar icon: "+icon);
  }
  if((sidebar.match(/disclosure-chevron/g)||[]).length<4)
    throw new Error("Native details disclosures are missing Lucide expand indicators.");
  if(!sidebar.includes('aria-hidden="true"'))
    throw new Error("Decorative sidebar icons must be hidden from screen readers.");
  console.log("PRINTS icon/sidebar smoke passed; ordered sections",sectionOrder.length);

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
    "photo-adjust-full-image","Brightness","Contrast","Saturation",
    "Apply changes","Edit photo"]){
    if(!photoHtml.includes(required))
      throw new Error("Missing dedicated photo editor marker: "+required);
  }
  if(!photoHtml.includes("brightness(1.25)"))
    throw new Error("Photo editor did not apply saved adjustments to the full-photo preview.");
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
