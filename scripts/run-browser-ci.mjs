import {spawn} from "node:child_process";
import {mkdir,cp,readdir,writeFile,readFile,rm} from "node:fs/promises";
import chromium from "@sparticuz/chromium";

// The single-process serverless Chromium binary can hang while tearing down
// the second Playwright context in a long-lived runner. Run each acceptance
// case in a fresh process, never suppress, skip or retry away failures.
chromium.setGraphicsMode=false;
const executable=await chromium.executablePath();
const browserArgs=chromium.args;
const viewports=["phone-portrait","phone-landscape","tablet","desktop","narrow"];
const cases=[
 "layout","crop-transaction","frames-layers","export-geometry","accessibility",
 "recovery","session-recovery","named-recovery","session-reset","corrupt-fallback","tab-isolation",
 "visual-transaction","sharpness-local",
];
const evidenceRoot="test-results-batches";
if(process.env.VERCEL_ENV==="preview")
 await rm(evidenceRoot,{recursive:true,force:true});

async function filesUnder(root,relative=""){
 const entries=await readdir(root+"/"+relative,{withFileTypes:true});
 const files=[];
 for(const entry of entries){
  const next=relative?relative+"/"+entry.name:entry.name;
  if(entry.isDirectory())files.push(...await filesUnder(root,next));
  else files.push(next);
 }
 return files.sort();
}
let completedViewports=0,completedTests=0;
let failed=false;
for(const viewport of viewports){
 console.log("Running all PRINTS browser acceptance cases for "+viewport);
 for(const name of cases){
  const project=viewport+"-"+name;
  const child=spawn(process.execPath,
   ["node_modules/playwright/cli.js","test","--project="+project],
   {stdio:"inherit",env:{...process.env,PRINTS_CHROMIUM_EXECUTABLE:executable,
    PRINTS_CHROMIUM_ARGS:JSON.stringify(browserArgs),PRINTS_BROWSER_CI:"1"}});
  const exit=await new Promise(resolve=>{
   child.once("exit",code=>resolve(code??1));
   child.once("error",()=>resolve(1));
  });
  let healthy=exit===0;
  try{
   const report=JSON.parse(await readFile("test-results/results.json","utf8"));
   const stats=report.stats??{};
   // Exactly one test per isolated browser process, with no silent omissions.
   if(stats.expected!==1||stats.skipped!==0||stats.flaky!==0||stats.unexpected!==0){
    console.error("Browser acceptance incomplete for "+project+": "+JSON.stringify(stats));
    healthy=false;
   }
  }catch(error){
   console.error("Unable to verify acceptance evidence for "+project,error);
   healthy=false;
  }
  if(process.env.VERCEL_ENV==="preview"){
   await mkdir(evidenceRoot+"/"+viewport,{recursive:true});
   await cp("test-results",evidenceRoot+"/"+viewport+"/"+name,{recursive:true});
  }
  if(!healthy){
   console.error("Required browser acceptance failed: "+project);
   failed=true;break;
  }
  completedTests++;
 }
 if(failed)break;
 completedViewports++;
}
if(process.env.VERCEL_ENV==="preview"){
 await mkdir("dist/__qa",{recursive:true});
 await cp(evidenceRoot,"dist/__qa",{recursive:true});
 const manifest=await filesUnder(evidenceRoot);
 await writeFile("dist/__qa/manifest.json",JSON.stringify({
  completedViewports,completedTests,
  expectedViewports:viewports.length,expectedTests:viewports.length*cases.length,
  files:manifest,
 },null,2));
}
console.log("PRINTS browser acceptance completed: "+completedTests+
 "/"+(viewports.length*cases.length)+" cases across "+completedViewports+
 "/"+viewports.length+" viewports.");
if(failed||completedViewports!==viewports.length||completedTests!==viewports.length*cases.length)
 process.exitCode=1;
