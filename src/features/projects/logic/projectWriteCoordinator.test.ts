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
 assert.equal(await pending,false);
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

test("editing invalidates a pending snapshot before it reaches IndexedDB",async()=>{
 const gate=new ProjectWriteCoordinator();
 const pendingVersion=gate.begin("job");
 // The user edits while the old snapshot is still reading image blobs.
 gate.begin("job");
 let writes=0;
 const old=await gate.run("job",pendingVersion,async()=>{writes++;});
 assert.equal(old,false);
 assert.equal(writes,0);
});
test("an in-flight older write cannot claim the current revision",async()=>{
 const gate=new ProjectWriteCoordinator();
 let release!:()=>void;
 let started!:()=>void;
 const workStarted=new Promise<void>(resolve=>{started=resolve;});
 const pause=new Promise<void>(resolve=>{release=resolve;});
 const version=gate.begin("job");
 const running=gate.run("job",version,async()=>{started();await pause;});
 await workStarted;
 gate.begin("job");
 release();
 assert.equal(await running,false);
});

test("delete waits for an in-flight save and prevents delayed resurrection",async()=>{
 const gate=new ProjectWriteCoordinator();
 let started!:()=>void;
 let release!:()=>void;
 const start=new Promise<void>(resolve=>{started=resolve;});
 const pause=new Promise<void>(resolve=>{release=resolve;});
 const record:{value:string|null}={value:null};
 const earlier=gate.begin("job");
 const writing=gate.run("job",earlier,async()=>{
   started();await pause;record.value="old snapshot";
 });
 await start;
 const deleting=gate.remove("job",async()=>{record.value=null;});
 const delayedVersion=gate.begin("job");
 const delayed=gate.run("job",delayedVersion,async()=>{record.value="resurrected";});
 release();
 assert.equal(await writing,false);
 await deleting;
 assert.equal(await delayed,false);
 assert.equal(record.value,null);
 const postDeleteVersion=gate.begin("job");
 assert.equal(await gate.run("job",postDeleteVersion,async()=>{
   record.value="resurrected again";
 }),false);
 assert.equal(record.value,null);
});
test("delete failure releases tombstone without poisoning write queue",async()=>{
 const gate=new ProjectWriteCoordinator();
 await assert.rejects(gate.remove("job",async()=>{throw Error("blocked storage");}),/blocked storage/);
 const revision=gate.begin("job");
 assert.equal(await gate.run("job",revision,async()=>{}),true);
});
test("deletion fences snapshots before they finish rasterizing",async()=>{
 const gate=new ProjectWriteCoordinator();
 const stale=gate.begin("job");
 let wrote=false;
 await gate.remove("job",async()=>{});
 const didSave=await gate.run("job",stale,async()=>{wrote=true;});
 assert.equal(didSave,false);
 assert.equal(wrote,false);
});
