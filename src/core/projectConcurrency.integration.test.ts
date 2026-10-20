import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import {
  beginProjectSave,deleteProject,loadProject,matchesProjectRevision,saveProject,
  storedProjectRevision,
} from "./projectStore.ts";
import type {StoredProject} from "./projectStore.ts";

function project(id:string,token:string):StoredProject{
  return {schemaVersion:1,id,name:"Safety test",revisionToken:token,
    updatedAt:"2026-10-20T00:00:00.000Z",
    settings:{paper:"A4",orientation:"portrait",customWidthMm:210,
      customHeightMm:297,marginMm:5,gapMm:3,cutGuides:true},
    assets:[]};
}
async function put(p:StoredProject,expected:string|null,session:string){
  return saveProject(p,beginProjectSave(p.id),expected,session);
}

test("distinct editor sessions cannot overwrite a newer IndexedDB revision",async()=>{
  const id="cross-tab-"+crypto.randomUUID();
  const initial=project(id,"rev-initial");
  assert.equal(await put(initial,null,"tab-1"),true);
  const seenByTwo=await loadProject(id);
  assert.equal(storedProjectRevision(seenByTwo),"rev-initial");

  const next=project(id,"rev-newer");
  assert.equal(await put(next,storedProjectRevision(seenByTwo),"tab-2"),true);
  const stale=project(id,"rev-lost-update");
  await assert.rejects(put(stale,"rev-initial","tab-1"),/another tab/);
  assert.equal((await loadProject(id)).revisionToken,"rev-newer");
  await deleteProject(id);
});

test("same session can chain committed writes while its UI revision catches up",async()=>{
  const id="same-session-"+crypto.randomUUID();
  assert.equal(await put(project(id,"rev-a"),null,"editor"),true);
  assert.equal(await put(project(id,"rev-b"),"rev-a","editor"),true);
  // A queued snapshot may still hold the earlier UI revision; the same
  // editor's committed rev-b is its legitimate predecessor, not another tab.
  assert.equal(await put(project(id,"rev-c"),"rev-a","editor"),true);
  assert.equal((await loadProject(id)).revisionToken,"rev-c");
  await deleteProject(id);
});

test("deleted and legacy project tokens cannot accidentally match",()=>{
  const id="legacy";
  const legacy={...project(id,"rev"),revisionToken:undefined};
  assert.equal(storedProjectRevision(legacy),"2026-10-20T00:00:00.000Z");
  assert.equal(matchesProjectRevision(legacy,legacy.updatedAt),true);
  assert.equal(matchesProjectRevision(legacy,null),false);
  assert.equal(matchesProjectRevision(undefined,legacy.updatedAt),false);
  assert.equal(matchesProjectRevision(undefined,null),true);
});

test("deleting a stale project revision cannot remove another tab's edit",async()=>{
  const id="protected-delete-"+crypto.randomUUID();
  await put(project(id,"rev-old"),null,"tab-one");
  const original=await loadProject(id);
  await put(project(id,"rev-current"),original.revisionToken!,"tab-two");
  await assert.rejects(deleteProject(id,"rev-old"),/changed or was removed/);
  assert.equal((await loadProject(id)).revisionToken,"rev-current");
  // A rejected deletion releases the same-tab tombstone.
  assert.equal(await put(project(id,"rev-after-failure"),"rev-current","tab-two"),true);
  await deleteProject(id,"rev-after-failure");
  await assert.rejects(loadProject(id),/missing, invalid/);
});
test("deleting with a known current revision works for older projects",async()=>{
  const id="legacy-delete-"+crypto.randomUUID();
  await put(project(id,"rev-current"),null,"first-tab");
  await deleteProject(id,"rev-current");
  await assert.rejects(loadProject(id),/missing, invalid/);
});
