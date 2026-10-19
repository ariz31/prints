import type { StoredProject, StoredAsset } from "./projectStore.ts";
import { validProjectSettings } from "./projectStore.ts";
import { validDesignLayers } from "./layers.ts";
import { validPhotoAdjustments } from "./photoAdjustments.ts";

/**
 * V1 portable, self-contained PRINTS project format. JSON is intentionally
 * simple to inspect and import without a server or third-party binary parser.
 * A 48 MiB asset limit prevents unbounded base64 memory allocations.
 */
export const PROJECT_ARCHIVE_LIMIT_BYTES = 48 * 1024 * 1024;
const ARCHIVE_FILE_LIMIT = 70 * 1024 * 1024;
const MAX_ASSETS = 25;
type ImageEnvelope = { mime: string; data: string };
type Archive = {
  format: "PRINTS_PROJECT";
  schemaVersion: 1;
  project: {
    id: string; name: string; updatedAt: string; settings: StoredProject["settings"];
    assets: Array<Omit<StoredAsset, "original" | "processed"> & {
      original: ImageEnvelope; processed?: ImageEnvelope;
    }>;
  };
};
const MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function checkedImage(blob: Blob, isProcessed: boolean): void {
  if (blob.size < 1 || blob.size > 25 * 1024 * 1024 ||
      !(isProcessed ? blob.type === "image/png" : MIME.has(blob.type))) {
    throw new Error("Project archive contains an unsupported or oversized image.");
  }
}
function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  // Block boundaries are divisible by 3, so base64 padding only occurs at the end.
  for (let i = 0; i < bytes.length; i += 24_576) {
    parts.push(btoa(String.fromCharCode(...bytes.subarray(i, i + 24_576))));
  }
  return parts.join("");
}
function fromBase64(data: string): Uint8Array {
  if (!data || data.length > 35 * 1024 * 1024 ||
      data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    throw new Error("Project archive contains invalid image encoding.");
  }
  const raw = atob(data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
async function packImage(blob: Blob, isProcessed: boolean): Promise<ImageEnvelope> {
  checkedImage(blob, isProcessed);
  return { mime: blob.type, data: toBase64(new Uint8Array(await blob.arrayBuffer())) };
}
function restoreImage(value: unknown, isProcessed: boolean): Blob {
  if (!value || typeof value !== "object") throw new Error("Image payload missing from project archive.");
  const v = value as Record<string, unknown>;
  if (typeof v.mime !== "string" || typeof v.data !== "string") {
    throw new Error("Project archive has an invalid image payload.");
  }
  const bytes = fromBase64(v.data);
  const result = new Blob([new Uint8Array(bytes)], { type: v.mime });
  checkedImage(result, isProcessed);
  return result;
}
function validAssetFields(a: Record<string, unknown>): boolean {
  const positive = ["widthMm","heightMm","pixelWidth","pixelHeight"].every((k) =>
    typeof a[k] === "number" && Number.isFinite(a[k]) && (a[k] as number) > 0 &&
    (a[k] as number) <= 100_000);
  const bounded = ["focalX","focalY"].every((k) =>
    typeof a[k] === "number" && Number.isFinite(a[k]) &&
    (a[k] as number) >= 0 && (a[k] as number) <= 100);
  if (!positive || !bounded || typeof a.id !== "string" || !a.id ||
      typeof a.name !== "string" || a.name.length > 250 ||
      !Number.isSafeInteger(a.quantity) || (a.quantity as number) < 1 ||
      (a.quantity as number) > 1000) return false;
  const c = a.crop;
  if (!c || typeof c !== "object") return false;
  const crop = c as Record<string, unknown>;
  if (!["x","y","width","height"].every((k) => typeof crop[k] === "number" &&
      Number.isFinite(crop[k]))) return false;
  const [x,y,w,h] = ["x","y","width","height"].map(k => crop[k] as number);
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x+w > 1.000001 || y+h > 1.000001) return false;
  if (a.layers !== undefined && !validDesignLayers(a.layers)) return false;
  if (a.adjustments !== undefined && !validPhotoAdjustments(a.adjustments)) return false;
  if (a.processedWidth !== undefined && (typeof a.processedWidth !== "number" ||
      !Number.isFinite(a.processedWidth) || a.processedWidth <= 0)) return false;
  if (a.processedHeight !== undefined && (typeof a.processedHeight !== "number" ||
      !Number.isFinite(a.processedHeight) || a.processedHeight <= 0)) return false;
  return true;
}
export async function createProjectArchive(project: StoredProject): Promise<Blob> {
  if (project.schemaVersion !== 1 || !validProjectSettings(project.settings) ||
      !project.name.trim() || !Array.isArray(project.assets) ||
      project.assets.length > MAX_ASSETS) throw new Error("Cannot export an invalid project.");
  const combined = project.assets.reduce((sum, a) => sum + a.original.size + (a.processed?.size ?? 0), 0);
  if (combined > PROJECT_ARCHIVE_LIMIT_BYTES) {
    throw new Error("Project exceeds the 48 MiB portable backup limit. Reduce source image sizes.");
  }
  const ids = new Set<string>();
  const assets = [];
  for (const { original, processed, ...meta } of project.assets) {
    if (!validAssetFields(meta) || ids.has(meta.id)) throw new Error("Invalid project asset metadata.");
    ids.add(meta.id);
    assets.push({
      ...meta,
      original: await packImage(original, false),
      ...(processed ? { processed: await packImage(processed, true) } : {}),
    });
  }
  const archive: Archive = {
    format: "PRINTS_PROJECT", schemaVersion: 1,
    project: { id: project.id, name: project.name, updatedAt: project.updatedAt,
      settings: project.settings, assets },
  };
  return new Blob([JSON.stringify(archive)], { type: "application/json" });
}
export async function readProjectArchive(file: Blob): Promise<StoredProject> {
  if (file.size < 1 || file.size > ARCHIVE_FILE_LIMIT) {
    throw new Error("Unsupported backup size (maximum 70 MiB).");
  }
  let data: unknown;
  try { data = JSON.parse(await file.text()) as unknown; }
  catch { throw new Error("This file is not a valid PRINTS project backup."); }
  if (!data || typeof data !== "object") throw new Error("Unsupported project backup.");
  const d = data as Record<string, unknown>;
  if (d.format !== "PRINTS_PROJECT" || d.schemaVersion !== 1 ||
      !d.project || typeof d.project !== "object") throw new Error("Unsupported project backup version.");
  const p = d.project as Record<string, unknown>;
  if (typeof p.name !== "string" || !p.name.trim() || p.name.length > 100 ||
      !validProjectSettings(p.settings) || !Array.isArray(p.assets) ||
      p.assets.length > MAX_ASSETS) throw new Error("Invalid project metadata in backup.");
  const assetIds = new Set<string>();
  let total = 0;
  const assets: StoredAsset[] = [];
  for (const raw of p.assets) {
    if (!raw || typeof raw !== "object") throw new Error("Invalid backup asset.");
    const a = raw as Record<string, unknown>;
    if (!validAssetFields(a) || assetIds.has(a.id as string)) {
      throw new Error("Invalid or duplicated print item in backup.");
    }
    assetIds.add(a.id as string);
    const original = restoreImage(a.original, false);
    const processed = a.processed === undefined ? undefined : restoreImage(a.processed, true);
    total += original.size + (processed?.size ?? 0);
    if (total > PROJECT_ARCHIVE_LIMIT_BYTES) throw new Error("Project exceeds the portable backup limit.");
    const { original: ignoredOriginal, processed: ignoredProcessed, ...metadata } = a;
    void ignoredOriginal; void ignoredProcessed;
    assets.push({ ...metadata, original, ...(processed ? { processed } : {}) } as StoredAsset);
  }
  // Never overwrite an existing IndexedDB record from an imported file.
  return {
    schemaVersion: 1, id: crypto.randomUUID(), name: p.name + " (imported)",
    updatedAt: new Date().toISOString(), settings: p.settings as StoredProject["settings"], assets,
  };
}
