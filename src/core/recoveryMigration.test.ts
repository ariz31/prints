import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import {listProjects,loadProject,stashDeletedDesign,readDeletedDesign} from "./projectStore.ts";
import type {StoredProject} from "./projectStore.ts";

test("database v1 projects upgrade to recycle-bin schema without losing saved blobs",async()=>{
  const id="legacy-upgrade";
  const original=new Blob([new Uint8Array([1,2,3])],{type:"image/png"});
  const project:StoredProject={
    schemaVersion:1,id,name:"Legacy project",updatedAt:"2026-10-01T00:00:00Z",
    settings:{paper:"A4",orientation:"portrait",customWidthMm:210,customHeightMm:297,
      marginMm:5,gapMm:3,cutGuides:true},
    assets:[{id:"photo",name:"photo.png",original,pixelWidth:100,pixelHeight:100,
      widthMm:25.4,heightMm:25.4,quantity:1,focalX:50,focalY:50,
      crop:{x:0,y:0,width:1,height:1}}],
  };
  const old=await new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open("prints-projects-v1",1);
    request.onupgradeneeded=()=>request.result.createObjectStore("projects",{keyPath:"id"});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
  await new Promise<void>((resolve,reject)=>{
    const tx=old.transaction("projects","readwrite");
    tx.objectStore("projects").put(project);
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(tx.error);
  });
  old.close();
  const list=await listProjects();
  assert.ok(list.some(p=>p.id===id));
  const reopened=await loadProject(id);
  assert.deepEqual(new Uint8Array(await reopened.assets[0].original.arrayBuffer()),
    new Uint8Array(await original.arrayBuffer()));
  const key=await stashDeletedDesign(reopened.assets[0],id,"Legacy project");
  assert.equal((await readDeletedDesign(key)).name,"photo.png");
});
