export { default as WorkflowPanel } from "./components/WorkflowPanel.tsx";
export { default } from "./components/WorkflowPanel.tsx";

export {
  TRASH_RETENTION_DAYS,
  saveProject,
  loadProject,
  listProjects,
  deleteProject,
  restoreDeletedProject,
  listTrash,
  readDeletedDesign,
  permanentlyDeleteTrash,
  purgeExpiredTrash,
  validProjectSettings,
  createProjectSnapshot,
  storedProjectRevision,
  matchesProjectRevision,
  beginProjectSave,
  validateStoredProject,
  stashDeletedDesign,
  materializeProject,
  type StoredProject,
  type ProjectSettings,
  type ProjectSummary,
  type TrashSummary,
  type TrashRecord,
  type StoredAsset,
} from "./logic/projectStore.ts";

export {
  PROJECT_ARCHIVE_LIMIT_BYTES,
  createProjectArchive,
  readProjectArchive,
  validAssetFields,
  consistentProcessedMetadata,
  checkedImage,
} from "./logic/projectArchive.ts";

export {
  createProjectZipArchive,
  readProjectZipArchive,
  assertImageSignature,
} from "./logic/projectZipArchive.ts";

export {
  ProjectWriteCoordinator,
} from "./logic/projectWriteCoordinator.ts";

export {
  listRecoverableDrafts,
  readRecoverableDraft,
  loadRecoverableDraft,
  storeRecoverableDraft,
  discardRecoverableDraft,
  validRecoveryRecord,
  newestRecoveryFirst,
  obsoleteRecoveryIds,
  type RecoveryRecord,
  type RecoverySummary,
} from "./logic/draftRecovery.ts";

export {
  planRecoveredWorkspace,
  matchesActiveRecovery,
  type RecoveryOrigin,
  type RecoveryResumePlan,
} from "./logic/workspaceRecovery.ts";

export {
  validSessionPeerMessage,
  shouldForkSession,
  type SessionPeerMessage,
} from "./logic/tabSessionCollision.ts";

export {
  applyWorkflow,
  captureWorkflow,
  makeStep,
  reusablePaperParameters,
  recordSemanticStep,
  type WorkflowInput,
  type WorkflowResult,
} from "./logic/workflowEngine.ts";

export {
  WORKFLOW_BACKUP_LIMIT_BYTES,
  createWorkflowBackup,
  readWorkflowBackup,
} from "./logic/workflowBackup.ts";
