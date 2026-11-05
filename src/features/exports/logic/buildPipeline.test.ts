import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const root=new URL("../../../../",import.meta.url);
function readJson(file:string):Record<string,unknown>{
 return JSON.parse(readFileSync(new URL(file,root),"utf8")) as Record<string,unknown>;
}

/** Keep browser automation out of Vercel preview/production builds.
 * Unit and integration tests under src/core remain part of every build. */
test("Vercel and production build run unit/integration tests without E2E",()=>{
 const pkg=readJson("package.json");
 const scripts=pkg.scripts as Record<string,string>;
 const vercel=readJson("vercel.json");
 assert.equal(vercel.buildCommand,"npm run build");
 assert.match(scripts.build,/\bnpm run test\b/);
 assert.match(scripts.build,/\bnpm run typecheck\b/);
 assert.match(scripts.test,/src\/\*\*\/\*\.test\.ts/);
 const forbidden=/\be2e\b|browser:ci|run-browser-ci|playwright/i;
 const commands:[string,string][]=[
  ["vercel buildCommand",String(vercel.buildCommand)],
  ["npm run build",scripts.build],
  ["npm test",scripts.test],
 ];
 for(const [label,command] of commands){
  assert.doesNotMatch(String(command),forbidden,label+" must never launch E2E");
 }
 assert.ok(!Object.keys(scripts).some(name=>/e2e|browser:ci/i.test(name)),
  "E2E npm script entry points must remain disabled");
});
