import assert from "node:assert/strict";
import test from "node:test";
import {ProjectWriteCoordinator} from "./projectWriteCoordinator.ts";
test("slow old snapshot never overwrites a newer save",async()=>{
 const gate=new ProjectWriteCoordinator();
 const old=gate.begin("job"),fresh=gate.begin("job");
 const saved:string[]=[];
 assert.equal(await gate.run("job",fresh,async()=>{saved.push("new");}),true);
 assert.equal(await gate.run("job",old,async()=>{saved.push("old");}),false);
 assert.deepEqual(saved,["new"]);
});
test("inflight write serializes behind current and newer wins",async()=>{
 const gate=new ProjectWriteCoordinator();
 let release!:()=>void;
 const pause=new Promise<void>(resolve=>{release=resolve;});
 const stored:string[]=[];
 let markStarted!:()=>void;
 const started=new Promise<void>(resolve=>{markStarted=resolve;});
 const older=gate.begin("job");
 const pending=gate.run("job",older,async()=>{
   stored.push("older");markStarted();await pause;
 });
 await started;
 const fresh=gate.begin("job");
 const recent=gate.run("job",fresh,async()=>{stored.push("newer");});
 release();
 assert.equal(await pending,true);
 assert.equal(await recent,true);
 assert.deepEqual(stored,["older","newer"]);
});
test("failed write does not poison the project save queue",async()=>{
 const gate=new ProjectWriteCoordinator();
 const first=gate.begin("a");
 await assert.rejects(gate.run("a",first,async()=>{throw new Error("quota");}),/quota/);
 const next=gate.begin("a");
 assert.equal(await gate.run("a",next,async()=>{}),true);
});
test("different projects maintain separate revisions",async()=>{
 const gate=new ProjectWriteCoordinator();
 const a=gate.begin("a"),b=gate.begin("b");
 assert.equal(await gate.run("a",a,async()=>{}),true);
 assert.equal(await gate.run("b",b,async()=>{}),true);
});
