import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import {
  beginProjectSave, deleteProject, listProjects, listTrash, loadProject,
  permanentlyDeleteTrash, readDeletedDesign, restoreDeletedProject, saveProject,
  stashDeletedDesign,
} from "./projectStore.ts";
import type {StoredAsset, StoredProject} from "./projectStore.ts";

function sampleAsset(id:string):StoredAsset {
  return {
    id,name:"portrait.png",pixelWidth:1000,pixelHeight:1000,
    widthMm:25.4,heightMm:25.4,quantity:12,focalX:50,focalY:50,
    crop:{x:0.15,y:0.1,width:0.7,height:0.7},
    layers:[{id:"text-layer",kind:"text",name:"Student",visible:true,
      x:0,y:0,width:0.8,height:0.2,color:"#000000",fontSizePt:10,text:"Name"}],
    original:new Blob([new Uint8Array([1,2,3,4])],{type:"image/png"}),
    processed:new Blob([new Uint8Array([7,8,9])],{type:"image/png"}),
  };
}
function sampleProject(id:string):StoredProject {
  return {
    schemaVersion:1,id,name:"Print job",updatedAt:new Date().toISOString(),
    revisionToken:crypto.randomUUID(),
    settings:{paper:"A4",orientation:"portrait",customWidthMm:210,customHeightMm:297,
      marginMm:5,gapMm:2,cutGuides:true},
    assets:[sampleAsset(crypto.randomUUID())],
  };
}

test("deleted image retains original/processed Blobs and complete design metadata",async()=>{
  const asset=sampleAsset(crypto.randomUUID());
  const key=await stashDeletedDesign(asset,null,"Untitled print job");
  const saved=await readDeletedDesign(key);
  assert.equal(saved.id,asset.id);
  assert.deepEqual(saved.crop,asset.crop);
  assert.deepEqual(saved.layers,asset.layers);
  assert.equal(saved.quantity,12);
  assert.deepEqual(new Uint8Array(await saved.original.arrayBuffer()),
    new Uint8Array(await asset.original.arrayBuffer()));
  assert.deepEqual(new Uint8Array(await saved.processed!.arrayBuffer()),
    new Uint8Array(await asset.processed!.arrayBuffer()));
  assert.ok((await listTrash()).some(entry=>
    entry.id===key&&entry.kind==="design"&&entry.assetId===asset.id));
  await permanentlyDeleteTrash(key);
  await assert.rejects(readDeletedDesign(key),/no longer available/);
});

test("project deletion atomically moves complete job to trash and restores as new ID",async()=>{
  const project=sampleProject(crypto.randomUUID());
  assert.equal(await saveProject(project),true);
  const initial=await loadProject(project.id);
  await deleteProject(project.id,initial.revisionToken);
  assert.equal((await listProjects()).some(p=>p.id===project.id),false);
  await assert.rejects(loadProject(project.id),/missing/);
  const trash=(await listTrash()).find(entry=>
    entry.kind==="project"&&entry.sourceProjectId===project.id);
  assert.ok(trash);
  assert.equal(trash.itemCount,1);
  const restored=await restoreDeletedProject(trash.id);
  assert.notEqual(restored.id,project.id);
  assert.equal(restored.name,"Print job (restored)");
  const opened=await loadProject(restored.id);
  assert.deepEqual(opened.assets[0].crop,project.assets[0].crop);
  assert.deepEqual(opened.assets[0].layers,project.assets[0].layers);
  assert.deepEqual(new Uint8Array(await opened.assets[0].original.arrayBuffer()),
    new Uint8Array(await project.assets[0].original.arrayBuffer()));
  assert.ok((await listProjects()).some(p=>p.id===restored.id));
  assert.equal((await listTrash()).some(entry=>entry.id===trash.id),false);
});

test("outdated deletion fails without destroying project",async()=>{
  const project=sampleProject(crypto.randomUUID());
  await saveProject(project);
  await assert.rejects(deleteProject(project.id,"outdated"),/changed or was removed/);
  assert.equal((await loadProject(project.id)).name,"Print job");
});

test("delayed same-session save cannot resurrect a deleted project",async()=>{
  const project=sampleProject(crypto.randomUUID());
  await saveProject(project);
  await deleteProject(project.id,project.revisionToken);
  const stale={...project,revisionToken:crypto.randomUUID()};
  const wrote=await saveProject(stale,beginProjectSave(project.id),project.revisionToken);
  assert.equal(wrote,false);
  assert.equal((await listProjects()).some(p=>p.id===project.id),false);
});
