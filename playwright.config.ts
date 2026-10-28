import {defineConfig} from "@playwright/test";
export default defineConfig({
 testDir:"./e2e",fullyParallel:false,workers:1,timeout:60_000,
 expect:{timeout:10_000,toHaveScreenshot:{maxDiffPixelRatio:.01}},
 outputDir:"test-results",reporter:[["list"],["json",{outputFile:"test-results/results.json"}]],
 use:{baseURL:process.env.PRINTS_TEST_URL??"http://127.0.0.1:5173",headless:true,
  screenshot:"only-on-failure",trace:"retain-on-failure",
  launchOptions:{executablePath:process.env.PRINTS_CHROMIUM_EXECUTABLE,
   args:[...(process.env.PRINTS_TEST_SINGLE_PROCESS?["--single-process","--no-zygote","--in-process-gpu"]:[]),"--no-sandbox","--disable-dev-shm-usage","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]}},
 webServer:process.env.PRINTS_TEST_URL?undefined:{command:process.env.PRINTS_BROWSER_CI?"npm run preview -- --host 127.0.0.1 --port 5173":"npm run dev -- --host 127.0.0.1",url:"http://127.0.0.1:5173",reuseExistingServer:true},
 projects:[
  {name:"phone-portrait",use:{viewport:{width:390,height:844},hasTouch:true,isMobile:true}},
  {name:"phone-landscape",use:{viewport:{width:844,height:390},hasTouch:true,isMobile:true}},
  {name:"tablet",use:{viewport:{width:768,height:1024},hasTouch:true,isMobile:true}},
  {name:"desktop",use:{viewport:{width:1440,height:900}}},
  {name:"narrow",use:{viewport:{width:320,height:568},hasTouch:true,isMobile:true}},
 ],
});
