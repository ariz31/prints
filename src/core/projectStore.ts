import type { Orientation, PaperName } from "./layout.ts";
import type { PhotoAsset } from "./exportPdf.ts";
import { FULL_CROP, fitCropToAspect } from "./crop.ts";
import { validDesignLayers } from "./layers.ts";

export interface ProjectSettings {
  paper: PaperName;
  orientation: Orientation;
  customWidthMm: number;
  customHeightMm: number;
  marginMm: number;
  gapMm: number;
  cutGuides: boolean;
}
export interface ProjectSummary { id: string; name: string; updatedAt: string; itemCount: number }

export type StoredAsset = Omit<PhotoAsset, "url" | "processedUrl"> & { original: Blob; processed?: Blob };
export interface StoredProject {
  schemaVersion: 1;
  id: string;
  name: string;
  updatedAt: string;
  settings: ProjectSettings;
  assets: StoredAsset[];
}

const DB_NAME = "prints-projects-v1";
const STORE = "projects";

export function validProjectSettings(value: unknown): value is ProjectSettings {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return ["A4", "A3", "Letter", "Legal", "Long Bond", "Custom"].includes(String(p.paper)) &&
    ["portrait", "landscape"].includes(String(p.orientation)) &&
    ["customWidthMm", "customHeightMm"].every((key) => typeof p[key] === "number" &&
      Number.isFinite(p[key]) && (p[key] as number) > 0) &&
    ["marginMm", "gapMm"].every((key) => typeof p[key] === "number" &&
      Number.isFinite(p[key]) && (p[key] as number) >= 0) && typeof p.cutGuides === "boolean";
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(
    new Error("IndexedDB is unavailable. Try another browser or storage setting."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Cannot open project storage."));
    request.onblocked = () => reject(new Error("Close other PRINTS tabs to upgrade project storage."));
  });
}

async function requestTransaction<T>(mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let value: T;
    let settled = false;
    const tx = db.transaction(STORE, mode);
    const req = work(tx.objectStore(STORE));
    req.onsuccess = () => { value = req.result; };
    tx.oncomplete = () => { settled = true; db.close(); resolve(value); };
    tx.onabort = () => { settled = true; db.close(); reject(tx.error ?? new Error("Project storage failed.")); };
    tx.onerror = () => { /* onabort handles rejected transaction */ };
    if (settled) db.close();
  });
}

export async function createProjectSnapshot(
  id: string, name: string, settings: ProjectSettings, assets: readonly PhotoAsset[],
): Promise<StoredProject> {
  if (!name.trim()) throw new Error("Give this project a name before saving.");
  if (!validProjectSettings(settings)) throw new Error("Project settings are invalid.");
  const stored = await Promise.all(assets.map(async ({ url, processedUrl, ...meta }) => {
    const result = await fetch(url);
    if (!result.ok) throw new Error("An original source image is unavailable.");
    const original = await result.blob();
    let processed: Blob | undefined;
    if (processedUrl) {
      const edited = await fetch(processedUrl);
      if (!edited.ok) throw new Error("A processed image is unavailable.");
      processed = await edited.blob();
    }
    return { ...meta, original, ...(processed ? { processed } : {}) };
  }));
  return {
    schemaVersion: 1, id, name: name.trim(), updatedAt: new Date().toISOString(),
    settings: { ...settings }, assets: stored,
  };
}

export async function saveProject(project: StoredProject): Promise<void> {
  if (project.schemaVersion !== 1) throw new Error("Unsupported project format.");
  await requestTransaction("readwrite", (store) => store.put(project));
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const projects = await requestTransaction<StoredProject[]>("readonly", (store) => store.getAll());
  return projects.map((p) => ({
    id: p.id, name: p.name, updatedAt: p.updatedAt, itemCount: p.assets.length,
  })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadProject(id: string): Promise<StoredProject> {
  const value = await requestTransaction<StoredProject | undefined>("readonly", (store) => store.get(id));
  if (!value || value.schemaVersion !== 1 || !validProjectSettings(value.settings) ||
    !Array.isArray(value.assets) || value.assets.some((a) =>
      !a || !(a.original instanceof Blob) ||
      (a.processed !== undefined && !(a.processed instanceof Blob)) ||
      !Number.isFinite(a.widthMm) ||
      !Number.isFinite(a.heightMm) || !Number.isSafeInteger(a.quantity) ||
      (a.layers !== undefined && !validDesignLayers(a.layers)))) {
    throw new Error("Project missing, invalid or requires a newer PRINTS version.");
  }
  return value;
}

export async function deleteProject(id: string): Promise<void> {
  await requestTransaction("readwrite", (store) => store.delete(id));
}

export function materializeProject(project: StoredProject): PhotoAsset[] {
  return project.assets.map(({ original, processed, crop, ...meta }) => ({
    ...meta, crop: fitCropToAspect(crop??FULL_CROP,
      meta.processedWidth??meta.pixelWidth,meta.processedHeight??meta.pixelHeight,
      meta.widthMm,meta.heightMm),
    url: URL.createObjectURL(original),
    ...(processed ? { processedUrl: URL.createObjectURL(processed) } : {}),
  }));
}
