import {spawn} from "node:child_process";
import {mkdir,cp,readdir,writeFile} from "node:fs/promises";
import chromium from "@sparticuz/chromium";

// Build-only browser. No browser binary or test dependency is shipped in dist.
// Use Sparticuz's serverless Chromium argument set rather than forcing a
// single-process browser, which is unstable across repeated Playwright contexts.
chromium.setGraphicsMode=false;
const executable=await chromium.executablePath();
const browserArgs=chromium.args;
const child=spawn(process.execPath,["node_modules/playwright/cli.js","test"],{
 stdio:"inherit",env:{...process.env,PRINTS_CHROMIUM_EXECUTABLE:executable,
  PRINTS_CHROMIUM_ARGS:JSON.stringify(browserArgs),PRINTS_BROWSER_CI:"1"},
});
const result=await new Promise(resolve=>child.once("exit",code=>resolve(code??1)));
// Synthetic fixtures and acceptance evidence only; never customer photos.
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
if(process.env.VERCEL_ENV==="preview"){
 await mkdir("dist/__qa",{recursive:true});
 await cp("test-results","dist/__qa",{recursive:true});
 const manifest=await filesUnder("test-results");
 await writeFile("dist/__qa/manifest.json",JSON.stringify({files:manifest},null,2));
}
process.exitCode=Number(result);
