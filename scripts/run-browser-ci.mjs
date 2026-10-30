import {spawn} from "node:child_process";
import {mkdir,cp,readdir,writeFile,readFile,rm} from "node:fs/promises";
import chromium from "@sparticuz/chromium";

// Sparticuz Chromium runs as one serverless process. Long sequences of
// independent browser contexts can exhaust its fixture lifecycle. Restart
// the Playwright runner per viewport, without omitting any acceptance test.
chromium.setGraphicsMode=false;
const executable=await chromium.executablePath();
const browserArgs=chromium.args;
const viewportGroups=[
 {name:"phone-portrait",pattern:"phone-portrait-*"},
 {name:"phone-landscape",pattern:"phone-landscape-*"},
 {name:"tablet",pattern:"tablet-*"},
 {name:"desktop",pattern:"desktop-*"},
 {name:"narrow",pattern:"narrow-*"},
];
const evidenceRoot="test-results-batches";
// Match the nine explicit acceptance projects registered in playwright.config.ts.
// Refuse partial passes; additional projects must update this contract.
const expectedCasesPerViewport=9;
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
let completed=0;
for(const group of viewportGroups){
 console.log("Running all PRINTS browser acceptance cases for "+group.name);
 const child=spawn(process.execPath,
  ["node_modules/playwright/cli.js","test","--project="+group.pattern],
  {stdio:"inherit",env:{...process.env,PRINTS_CHROMIUM_EXECUTABLE:executable,
   PRINTS_CHROMIUM_ARGS:JSON.stringify(browserArgs),PRINTS_BROWSER_CI:"1"}});
 const result=await new Promise(resolve=>child.once("exit",code=>resolve(code??1)));
 let healthy=result===0;
 try{
  const report=JSON.parse(await readFile("test-results/results.json","utf8"));
  const stats=report.stats??{};
  // Every viewport must run all nine acceptance cases, with no hidden
  // skipped or flaky passes, before the release gate can be green.
  if(stats.expected!==expectedCasesPerViewport||stats.skipped!==0||stats.flaky!==0||stats.unexpected!==0){
   console.error("Browser acceptance incomplete for "+group.name+": "+JSON.stringify(stats));
   healthy=false;
  }
 }catch(error){
  console.error("Unable to verify browser acceptance evidence for "+group.name,error);
  healthy=false;
 }
 // Preserve all viewport reports, not only the final Playwright invocation.
 if(process.env.VERCEL_ENV==="preview"){
  await mkdir(evidenceRoot,{recursive:true});
  await cp("test-results",evidenceRoot+"/"+group.name,{recursive:true});
 }
 if(!healthy){process.exitCode=1;break;}
 completed++;
}
if(process.env.VERCEL_ENV==="preview"){
 await mkdir("dist/__qa",{recursive:true});
 await cp(evidenceRoot,"dist/__qa",{recursive:true});
 const manifest=await filesUnder(evidenceRoot);
 await writeFile("dist/__qa/manifest.json",JSON.stringify({
  completed,expectedViewports:viewportGroups.length,
  expectedTests:viewportGroups.length*expectedCasesPerViewport,files:manifest
 },null,2));
}
console.log("PRINTS browser acceptance completed: "+completed+"/"+viewportGroups.length+" viewports.");
if(completed!==viewportGroups.length)process.exitCode=1;
