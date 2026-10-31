import {defineConfig} from "@playwright/test";

function ciChromiumArgs():string[]{
 if(process.env.PRINTS_BROWSER_CI!=="1")return [];
 try{
  const parsed=JSON.parse(process.env.PRINTS_CHROMIUM_ARGS??"[]");
  return Array.isArray(parsed)&&parsed.every(value=>typeof value==="string")?parsed:[];
 }catch{return [];}
}

const viewports=[
 {name:"phone-portrait",use:{viewport:{width:390,height:844},hasTouch:true,isMobile:true}},
 {name:"phone-landscape",use:{viewport:{width:844,height:390},hasTouch:true,isMobile:true}},
 {name:"tablet",use:{viewport:{width:768,height:1024},hasTouch:true,isMobile:true}},
 {name:"desktop",use:{viewport:{width:1440,height:900}}},
 {name:"narrow",use:{viewport:{width:320,height:568},hasTouch:true,isMobile:true}},
] as const;

// Sparticuz Chromium is intentionally single-process in serverless environments.
// Closing a Playwright context can therefore terminate that browser process.
// Model every acceptance cell as its own project so all 25 checks retain full
// coverage while each receives an independent browser lifetime.
const acceptanceCases=[
 {name:"layout",grep:/workspace retains sheet/},
 {name:"crop-transaction",grep:/crop drafts cancel safely/},
 {name:"frames-layers",grep:/frame galleries, inline color/},
 {name:"seasonal-frame-gallery",grep:/redesigned seasonal gallery previews/},
 {name:"export-geometry",grep:/export dialog produces physical/},
 {name:"accessibility",grep:/critical accessibility rules pass/},
 {name:"recovery",grep:/saved original photo survives refresh/},
 {name:"session-recovery",grep:/last unsaved photo, print size and copies resume/},
 {name:"named-recovery",grep:/named project automatically reopens latest checkpoint/},
 {name:"session-reset",grep:/starting a new job never resurrects/},
 {name:"corrupt-fallback",grep:/a damaged session checkpoint cannot hide/},
 {name:"visual-transaction",grep:/canceling a frame edit preserves identical printed sheet pixels/},
 {name:"sharpness-local",grep:/rapid sharpening keeps the photo visible/},
] as const;

export default defineConfig({
 testDir:"./e2e",fullyParallel:false,workers:1,timeout:60_000,
 // The serverless Chromium process can hang in context teardown. One retry
 // distinguishes isolated infrastructure failures; the release audit must
 // still report flaky tests instead of counting them as clean passes.
 retries:process.env.PRINTS_BROWSER_CI==="1"?1:0,
 maxFailures:process.env.PRINTS_BROWSER_CI==="1"?1:0,
 expect:{timeout:10_000,toHaveScreenshot:{maxDiffPixelRatio:.01}},
 outputDir:"test-results",reporter:[["list"],["json",{outputFile:"test-results/results.json"}]],
 use:{baseURL:process.env.PRINTS_TEST_URL??"http://127.0.0.1:5173",headless:true,
  screenshot:"only-on-failure",trace:"retain-on-failure",
  launchOptions:{executablePath:process.env.PRINTS_CHROMIUM_EXECUTABLE,args:ciChromiumArgs()}},
 webServer:process.env.PRINTS_TEST_URL?undefined:{command:process.env.PRINTS_BROWSER_CI?"npm run preview -- --host 127.0.0.1 --port 5173":"npm run dev -- --host 127.0.0.1",url:"http://127.0.0.1:5173",reuseExistingServer:true},
 projects:viewports.flatMap(viewport=>acceptanceCases.map(acceptance=>({
  name:viewport.name+"-"+acceptance.name,
  grep:acceptance.grep,
  use:viewport.use,
 }))),
});
