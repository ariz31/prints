import { useState, useRef, useEffect, useCallback, type ChangeEvent, type DragEvent } from "react";
import type { UserPreferences } from "./domain/models/preferences.ts";
import { readPreferences, savePreferences } from "./features/preferences/logic/preferences.ts";
import type { CustomPaperSize } from "./features/paper-sizes/logic/paperLibrary.ts";
import { readPaperLibrary, savePaperLibrary, PAPER_LIBRARY_KEY } from "./features/paper-sizes/logic/paperLibrary.ts";
import { useProjectController } from "./app/controllers/projectController.ts";
import { useWorkspaceController } from "./app/controllers/workspaceController.ts";
import { useEditorModalController } from "./app/controllers/editorModalController.ts";
import AppShell from "./app/shell/AppShell.tsx";

function displayError(error: unknown): string {
  return error instanceof Error ? error.message : "The operation could not be completed.";
}

export default function App() {
  const [userPrefs, setUserPrefs] = useState<UserPreferences>(readPreferences);
  const [customPapers, setCustomPapers] = useState<CustomPaperSize[]>(readPaperLibrary);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PAPER_LIBRARY_KEY) setCustomPapers(readPaperLibrary());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const project = useProjectController({ userPrefs });
  const workspace = useWorkspaceController({
    assets: project.assets,
    settings: project.settings,
    onUpdateSetting: project.updateSetting,
    onSetSettings: project.setSettings,
    rememberEdit: project.rememberEdit,
    setError: project.setError,
    setNotice: project.setNotice,
  });
  const editorModal = useEditorModalController({
    assets: project.assets,
    settings: project.settings,
    updateItem: project.updateItem,
    duplicateItem: project.duplicateItem,
    rememberEdit: project.rememberEdit,
    setAssets: project.setAssets,
    setSettings: project.setSettings,
    applyProcessedBackground: project.applyProcessedBackground,
    applyProcessedBackgroundBatch: project.applyProcessedBackgroundBatch,
    resetProcessedBackground: project.resetProcessedBackground,
    setError: project.setError,
    setNotice: project.setNotice,
    previews: workspace.previews,
  });

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void project.addFiles(e.target.files);
    e.target.value = "";
  }, [project]);

  const handleBackupFile = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    project.handleBackupFile(e);
  }, [project]);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files) void project.addFiles(e.dataTransfer.files);
  }, [project]);

  const handlePaperLibraryChange = useCallback((papers: CustomPaperSize[]) => {
    savePaperLibrary(papers);
    setCustomPapers([...papers]);
  }, []);

  const handleSavePreferences = useCallback((prefs: UserPreferences) => {
    try {
      savePreferences(prefs);
      setUserPrefs(prefs);
    } catch (cause) {
      project.setError(displayError(cause));
    }
  }, [project]);

  return (
    <AppShell
      project={project}
      workspace={workspace}
      editorModal={editorModal}
      userPrefs={userPrefs}
      customPapers={customPapers}
      fileInputRef={fileInputRef}
      backupInputRef={backupInputRef}
      onPaperLibraryChange={handlePaperLibraryChange}
      onSavePreferences={handleSavePreferences}
      onFileChange={handleFileChange}
      onBackupFile={handleBackupFile}
      onDrop={handleDrop}
    />
  );
}
