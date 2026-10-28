import {spawn} from "node:child_process";
import {mkdir,cp} from "node:fs/promises";
import chromium from "@sparticuz/chromium";
// Build-only browser. No browser binary or test dependency is shipped in dist.
const executable=await chromium.executablePath();
const child=spawn(process.execPath,["node_modules/playwright/cli.js","test"],{
 stdio:"inherit",env:{...process.env,PRINTS_CHROMIUM_EXECUTABLE:executable,PRINTS_TEST_SINGLE_PROCESS:"1",
  PRINTS_BROWSER_CI:"1"},
});
const result=await new Promise(resolve=>child.once("exit",code=>resolve(code??1)));
// Synthetic fixtures and acceptance evidence only; never customer photos.
if(process.env.VERCEL_ENV==="preview"){
 await mkdir("dist/__qa",{recursive:true});
 await cp("test-results","dist/__qa",{recursive:true});
}
process.exitCode=Number(result);
