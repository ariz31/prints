import type { ManualPlacement, Orientation, PaperName, TrimStyle } from "./sheet.ts";
import type { StoredAsset } from "./asset.ts";
import type { PrintModeConfig, NotepadPresetId } from "./printMode.ts";

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
  pdfDpi?: number;
  trimStyle?: TrimStyle;
  manualPlacements?: ManualPlacement[];
  notepadPreset?: NotepadPresetId;
  /** Old saved jobs without this field retain their explicitly stored quantities. */
  copyMode?: "automatic" | "manual";
  /** Non-destructive dedicated print-mode job; backed up with the project. */
  printModeConfig?: PrintModeConfig;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  itemCount: number;
  revision: string;
}

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

export const TRASH_RETENTION_DAYS = 30;

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

export type TrashRecord =
  | (TrashSummary & { kind: "design"; assetId: string; asset: StoredAsset })
  | (TrashSummary & { kind: "project"; project: StoredProject });

export interface NamedPreset {
  id: string;
  name: string;
  updatedAt: string;
  settings: ProjectSettings;
  itemWidthMm: number;
  itemHeightMm: number;
  quantity: number;
}

/** Revision of the named project at checkpoint capture time. */
export interface RecoveryOrigin {
  projectId: string;
  revision: string;
}

export interface RecoveryRecord {
  id: string;
  revision: number;
  updatedAt: string;
  project: StoredProject;
  /** Prevent a late checkpoint from a previous job from restoring over a new job. */
  workspaceToken?: string;
  /** Revision of the named project at checkpoint capture time. */
  origin?: RecoveryOrigin;
}

export type RecoverySummary = Pick<RecoveryRecord, "id" | "revision" | "updatedAt"> & {
  name: string;
  images: number;
};
