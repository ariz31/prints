import type { Orientation, PaperName } from "./layout.ts";
import type { PhotoAsset } from "./exportPdf.ts";
import { FULL_CROP, fitCropToAspect } from "./crop.ts";
import { validDesignLayers } from "./layers.ts";
import { validPhotoAdjustments } from "./photoAdjustments.ts";
import { assertSafeSourceSize } from "./assetIntegrity.ts";
import { validManualPlacements } from "./manualLayout.ts";
import type { ManualPlacement } from "./manualLayout.ts";
import { ProjectWriteCoordinator } from "./projectWriteCoordinator.ts";
import type { TrimStyle } from "./cutMarks.ts";

export interface ProjectSettings {
  paper: PaperName;
  orientation: Orientation;
  customWidthMm: number;
  customHeightMm: number;
  marginMm: number;
  gapMm: number;
  cutGuides: boolean;
  packing?: "ordered" | "compact" | "optimized";
  autoRotate?: boolean;
  trimStyle?: TrimStyle;
  manualPlacements?: ManualPlacement[];
}
export interface ProjectSummary { id: string; name: string; updatedAt: string; itemCount: number; revision: string }

export type StoredAsset = Omit<PhotoAsset, "url" | "processedUrl"> & { original: Blob; processed?: Blob };
export interface StoredProject {
  schemaVersion: 1;
  id: string;
  name: string;
  updatedAt: string;
  /** Unique save identifier for optimistic cross-tab concurrency. */
  revisionToken?: string;
  settings: ProjectSettings;
  assets: StoredAsset[];
}

const DB_NAME = "prints-projects-v1";
const STORE = "projects";
const TRASH_STORE = "recycleBin";
const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** A separate, locally stored recovery copy preserves the complete source Blobs. */
export interface TrashSummary {
  id: string;
  kind: "design" | "project";
  name: string;
  deletedAt: string;
  sourceProjectId: string | null;
  projectName?: string;
  assetId?: string;
  itemCount?: number;
}
type TrashRecord =
  | (TrashSummary & { kind: "design"; assetId: string; asset: StoredAsset })
  | (TrashSummary & { kind: "project"; project: StoredProject });

export const TRASH_RETENTION_DAYS = 30;


export function validProjectSettings(value: unknown): value is ProjectSettings {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return ["A4", "A3", "Letter", "Legal", "Long Bond", "Custom"].includes(String(p.paper)) &&
    ["portrait", "landscape"].includes(String(p.orientation)) &&
    ["customWidthMm", "customHeightMm"].every((key) => typeof p[key] === "number" &&
      Number.isFinite(p[key]) && (p[key] as number) > 0 && (p[key] as number) <= 2000) &&
    ["marginMm", "gapMm"].every((key) => typeof p[key] === "number" &&
      Number.isFinite(p[key]) && (p[key] as number) >= 0 && (p[key] as number) < 2000) && typeof p.cutGuides === "boolean" &&
    (p.packing === undefined || p.packing === "ordered" || p.packing === "compact" || p.packing === "optimized") &&
    (p.autoRotate === undefined || typeof p.autoRotate === "boolean") &&
    (p.trimStyle === undefined || p.trimStyle === "outline" || p.trimStyle === "corner") &&
    (p.manualPlacements===undefined || validManualPlacements(p.manualPlacements));
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(
    new Error("IndexedDB is unavailable. Try another browser or storage setting."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(TRASH_STORE)) db.createObjectStore(TRASH_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      const db=request.result;
      // Older tabs may still be open when this local schema is upgraded.
      // Close our own connection when another tab requests a future version.
      db.onversionchange=()=>db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("Cannot open project storage."));
    request.onblocked = () => reject(new Error("Close other PRINTS tabs to upgrade project storage."));
  });
}

async function requestTransaction<T>(mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>, storeName = STORE): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    try {
      let value: T;
      const tx = db.transaction(storeName, mode);
      tx.oncomplete = () => { db.close(); resolve(value); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Project storage failed.")); };
      const req = work(tx.objectStore(storeName));
      req.onsuccess = () => { value = req.result; };
    } catch (cause) {
      db.close();
      reject(cause);
    }
  });
}

export async function createProjectSnapshot(
  id: string, name: string, settings: ProjectSettings, assets: readonly PhotoAsset[],
): Promise<StoredProject> {
  if (!name.trim()) throw new Error("Give this project a name before saving.");
  if (!validProjectSettings(settings)) throw new Error("Project settings are invalid.");
  const images=new Map<string,Promise<Blob>>();
  function fetchOnce(url:string):Promise<Blob>{
    const previous=images.get(url);
    if(previous)return previous;
    const loaded=fetch(url).then(response=>{
      if(!response.ok)throw new Error("A project source image is unavailable.");
      return response.blob();
    });
    images.set(url,loaded);
    return loaded;
  }
  const stored=await Promise.all(assets.map(async ({url,processedUrl,...meta})=>{
    const original=await fetchOnce(url);
    const processed=processedUrl?await fetchOnce(processedUrl):undefined;
    return {...meta,original,...(processed?{processed}:{})};
  }));
  return {
    schemaVersion: 1, id, name: name.trim(), updatedAt: new Date().toISOString(),
    revisionToken: crypto.randomUUID(),
    settings: { ...settings }, assets: stored,
  };
}

/**
 * Compare the revision read within the same IndexedDB readwrite transaction
 * that performs the put. This prevents lost updates across tabs.
 * Legacy records use updatedAt until first saved with a UUID revision token.
 */
export function storedProjectRevision(project:StoredProject):string{
  return project.revisionToken??project.updatedAt;
}
export function matchesProjectRevision(
  stored:StoredProject|undefined,expected:string|null,
):boolean {
  return stored ? expected!==null && storedProjectRevision(stored)===expected : expected===null;
}
async function putIfUnchanged(project:StoredProject,expected:string|null):Promise<void>{
  const db=await openDatabase();
  return new Promise<void>((resolve,reject)=>{
    let conflict:Error|null=null;
    let tx:IDBTransaction;
    try {
      tx=db.transaction(STORE,"readwrite");
      const store=tx.objectStore(STORE);
      const lookup=store.get(project.id);
      lookup.onsuccess=()=>{
        if(!matchesProjectRevision(lookup.result as StoredProject|undefined,expected)){
          conflict=new Error("This project was modified or deleted in another tab. Download a portable backup of your current edits, then reopen the saved project before changing it.");
          tx.abort();
          return;
        }
        store.put(project);
      };
      tx.oncomplete=()=>{db.close();resolve();};
      tx.onabort=()=>{db.close();reject(conflict??tx.error??new Error("Project save failed."));};
    }catch(cause){
      db.close();
      reject(cause);
    }
  });
}
// A write that reaches IndexedDB before a newer same-tab edit can finish even
// when the coordinator reports it superseded. Preserve its revision as the
// immediate predecessor for the next queued write.
const latestLocalWrites=new Map<string,{origin:string|null;token:string}>();
const projectWrites=new ProjectWriteCoordinator();
export function beginProjectSave(id:string):number {
  return projectWrites.begin(id);
}
/** Returns false when a later revision has superseded this snapshot. */
export async function saveProject(
  project:StoredProject,revision=beginProjectSave(project.id),
  expectedRevision:string|null=null,sessionId?:string,
):Promise<boolean>{
  if(project.schemaVersion!==1)throw new Error("Unsupported project format.");
  if(!project.revisionToken)project.revisionToken=crypto.randomUUID();
  return projectWrites.run(project.id,revision,async()=>{
    // An origin may be advanced only by this editor session, never by a
    // separate tab/workspace; otherwise cross-tab conflicts could be bypassed.
    const key=sessionId?JSON.stringify([sessionId,project.id]):null;
    const local=key?latestLocalWrites.get(key):undefined;
    const expected=local&&(local.origin===expectedRevision||local.token===expectedRevision)
      ?local.token:expectedRevision;
    await putIfUnchanged(project,expected);
    if(key)latestLocalWrites.set(key,{origin:expectedRevision,token:project.revisionToken!});
  });
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const projects = await requestTransaction<StoredProject[]>("readonly", (store) => store.getAll());
  return projects.map((p) => ({
    id: p.id, name: p.name, updatedAt: p.updatedAt, itemCount: p.assets.length,
    revision: storedProjectRevision(p),
  })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadProject(id: string): Promise<StoredProject> {
  const value = await requestTransaction<StoredProject | undefined>("readonly", (store) => store.get(id));
  if (!value || value.schemaVersion !== 1 || !validProjectSettings(value.settings) ||
    (value.revisionToken!==undefined && (typeof value.revisionToken!=="string" || !value.revisionToken || value.revisionToken.length>100)) ||
    !Array.isArray(value.assets) || value.assets.some((a) =>
      !a || !(a.original instanceof Blob) ||
      (a.processed !== undefined && !(a.processed instanceof Blob)) ||
      !Number.isFinite(a.widthMm) || a.widthMm<=0 || a.widthMm>2000 ||
      !Number.isFinite(a.heightMm) || a.heightMm<=0 || a.heightMm>2000 ||
      !Number.isSafeInteger(a.quantity) || a.quantity<1 || a.quantity>1000 ||
      !Number.isSafeInteger(a.pixelWidth) || !Number.isSafeInteger(a.pixelHeight) ||
      (a.processedWidth !== undefined && (!Number.isSafeInteger(a.processedWidth) || a.processedWidth<1)) ||
      (a.processedHeight !== undefined && (!Number.isSafeInteger(a.processedHeight) || a.processedHeight<1)) ||
      (a.layers !== undefined && !validDesignLayers(a.layers)) ||
      (a.adjustments !== undefined && !validPhotoAdjustments(a.adjustments)))) {
    throw new Error("Project missing, invalid or requires a newer PRINTS version.");
  }
  for(const asset of value.assets){
    assertSafeSourceSize(asset.pixelWidth,asset.pixelHeight);
    if(asset.processedWidth!==undefined && asset.processedHeight!==undefined)
      assertSafeSourceSize(asset.processedWidth,asset.processedHeight);
  }
  return value;
}

/**
 * Conditional deletion is atomic with the revision check; a second browser
 * tab cannot save a newer version between checking and deleting it.
 * Callers that omit expectedRevision retain the unconditional delete API.
 */
/** Copy a deleted design's complete source and processing bytes into IndexedDB.
 * The caller commits the visible deletion only after this durable write succeeds.
 */
export async function stashDeletedDesign(
  asset: StoredAsset, sourceProjectId: string | null, projectName: string,
): Promise<string> {
  // Every deletion has a unique, immutable recovery ID. Reusing a predictable
  // ID could overwrite an older recovery copy across tabs or after Undo.
  const id = crypto.randomUUID();
  const record: TrashRecord = {
    id, kind: "design", name: asset.name, assetId: asset.id, asset,
    deletedAt: new Date().toISOString(), sourceProjectId, projectName,
  };
  await requestTransaction<IDBValidKey>("readwrite", store => store.put(record), TRASH_STORE);
  return id;
}

/** List metadata only; do not expose image Blobs to the React component tree. */
export async function listTrash(): Promise<TrashSummary[]> {
  const entries = await requestTransaction<TrashRecord[]>("readonly",
    store => store.getAll(), TRASH_STORE);
  const now = Date.now();
  return entries.filter(entry => {
    const deletedAt = Date.parse(entry.deletedAt);
    return Number.isFinite(deletedAt) && now - deletedAt < TRASH_RETENTION_MS;
  }).map(({ id, kind, name, deletedAt, sourceProjectId, projectName, assetId, itemCount }) =>
    ({ id, kind, name, deletedAt, sourceProjectId, ...(projectName ? { projectName } : {}),
      ...(assetId ? { assetId } : {}),
      ...(itemCount !== undefined ? { itemCount } : {}) }))
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export async function readDeletedDesign(id: string): Promise<StoredAsset> {
  const entry = await requestTransaction<TrashRecord | undefined>("readonly",
    store => store.get(id), TRASH_STORE);
  if (!entry || entry.kind !== "design" || !entry.asset ||
      !(entry.asset.original instanceof Blob) ||
      (entry.asset.processed !== undefined &&
        !(entry.asset.processed instanceof Blob)) ||
      !Number.isFinite(entry.asset.widthMm) || entry.asset.widthMm<=0 ||
      !Number.isFinite(entry.asset.heightMm) || entry.asset.heightMm<=0 ||
      !Number.isSafeInteger(entry.asset.quantity) || entry.asset.quantity<1 ||
      entry.asset.quantity>1000 ||
      (entry.asset.layers !== undefined && !validDesignLayers(entry.asset.layers)) ||
      (entry.asset.adjustments !== undefined &&
        !validPhotoAdjustments(entry.asset.adjustments)))
    throw new Error("The deleted design is unavailable or invalid.");
  assertSafeSourceSize(entry.asset.pixelWidth,entry.asset.pixelHeight);
  if (entry.asset.processedWidth !== undefined ||
      entry.asset.processedHeight !== undefined) {
    if (entry.asset.processedWidth === undefined ||
        entry.asset.processedHeight === undefined)
      throw new Error("Incomplete processed image dimensions.");
    assertSafeSourceSize(entry.asset.processedWidth,entry.asset.processedHeight);
  }
  return entry.asset;
}

export async function permanentlyDeleteTrash(id: string): Promise<void> {
  await requestTransaction("readwrite", store => store.delete(id), TRASH_STORE);
}

/** Expired recovery copies are purged without changing active projects. */
export async function purgeExpiredTrash(): Promise<number> {
  const records = await requestTransaction<TrashRecord[]>("readonly",
    store => store.getAll(), TRASH_STORE);
  const now = Date.now();
  const expired = records.filter(entry => {
    const deletedAt = Date.parse(entry.deletedAt);
    return !Number.isFinite(deletedAt) || now - deletedAt >= TRASH_RETENTION_MS;
  });
  for (const entry of expired)
    await permanentlyDeleteTrash(entry.id);
  return expired.length;
}

/** Move a saved project into the recycle bin atomically with removing it.
 * The existing project write coordinator still fences pending autosaves.
 */
export async function deleteProject(id: string, expectedRevision?: string): Promise<void> {
  await projectWrites.remove(id, async () => {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      let conflict: Error | null = null;
      try {
        const tx = db.transaction([STORE, TRASH_STORE], "readwrite");
        const projects = tx.objectStore(STORE);
        const trash = tx.objectStore(TRASH_STORE);
        const lookup = projects.get(id);
        lookup.onsuccess = () => {
          const project = lookup.result as StoredProject | undefined;
          if (!project || (expectedRevision !== undefined &&
              storedProjectRevision(project) !== expectedRevision)) {
            conflict = new Error("This saved project changed or was removed in another tab. Refresh before deleting.");
            tx.abort();
            return;
          }
          const entry: TrashRecord = {
            id: crypto.randomUUID(), kind: "project", name: project.name,
            sourceProjectId: project.id, deletedAt: new Date().toISOString(),
            itemCount: project.assets.length, project,
          };
          trash.put(entry);
          projects.delete(id);
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(conflict ?? tx.error ??
          new Error("Project deletion failed.")); };
      } catch (cause) { db.close(); reject(cause); }
    });
    for (const key of latestLocalWrites.keys()) {
      if (key.endsWith("," + JSON.stringify(id) + "]"))
        latestLocalWrites.delete(key);
    }
  });
}

/** Restore into a fresh project ID to avoid overwriting another tab's project
 * and to avoid reviving a write-coordinator tombstone from a deleted ID.
 */
export async function restoreDeletedProject(trashId: string): Promise<StoredProject> {
  const db = await openDatabase();
  return new Promise<StoredProject>((resolve, reject) => {
    let restored: StoredProject | undefined;
    let failure: Error | null = null;
    try {
      const tx = db.transaction([STORE, TRASH_STORE], "readwrite");
      const projects = tx.objectStore(STORE);
      const trash = tx.objectStore(TRASH_STORE);
      trash.get(trashId).onsuccess = event => {
        const entry = (event.target as IDBRequest<TrashRecord | undefined>).result;
        if (!entry || entry.kind !== "project") {
          failure = new Error("Deleted project is no longer available.");
          tx.abort();
          return;
        }
        const id = crypto.randomUUID();
        restored = { ...entry.project, id, name: entry.project.name + " (restored)",
          updatedAt: new Date().toISOString(), revisionToken: crypto.randomUUID() };
        projects.put(restored);
        trash.delete(trashId);
      };
      tx.oncomplete = () => { db.close(); resolve(restored!); };
      tx.onabort = () => { db.close(); reject(failure ?? tx.error ??
        new Error("Project recovery failed.")); };
    } catch (cause) { db.close(); reject(cause); }
  });
}

export function materializeProject(project:StoredProject):PhotoAsset[]{
  const urls=new WeakMap<Blob,string>();
  const sourceUrl=(blob:Blob)=>{
    const existing=urls.get(blob);
    if(existing)return existing;
    const created=URL.createObjectURL(blob);
    urls.set(blob,created);
    return created;
  };
  return project.assets.map(({original,processed,crop,...meta})=>({
    ...meta,crop:fitCropToAspect(crop??FULL_CROP,
      meta.processedWidth??meta.pixelWidth,meta.processedHeight??meta.pixelHeight,
      meta.widthMm,meta.heightMm),
    url:sourceUrl(original),
    ...(processed?{processedUrl:sourceUrl(processed)}:{}),
  }));
}
