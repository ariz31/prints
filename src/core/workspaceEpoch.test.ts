import assert from "node:assert/strict";
import test from "node:test";
import {WorkspaceEpoch} from "./workspaceEpoch.ts";

test("stale asynchronous file operations cannot publish across edits or project switches",async()=>{
 const state=new WorkspaceEpoch();
 const early=state.capture();
 let release!:()=>void;
 const pause=new Promise<void>(resolve=>{release=resolve;});
 let applied=false;
 const deleteTask=(async()=>{await pause;if(state.current(early))applied=true;})();
 state.advance(); // Project switch, another deletion or an intervening edit.
 release();
 await deleteTask;
 assert.equal(applied,false);
 const next=state.capture();
 assert.ok(state.current(next));
 state.advance(); // Undo/redo also invalidates asynchronous callbacks.
 assert.equal(state.current(next),false);
});
test("workspace revisions monotonically advance even after history is cleared",()=>{
 const epoch=new WorkspaceEpoch();
 const a=epoch.capture();
 assert.equal(epoch.advance(),a+1);
 assert.equal(epoch.advance(),a+2);
 assert.equal(epoch.current(a),false);
});
