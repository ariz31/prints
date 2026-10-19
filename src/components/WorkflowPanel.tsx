import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { PhotoAsset } from "../core/exportPdf.ts";
import type { ProjectSettings } from "../core/projectStore.ts";
import type { SavedWorkflow, WorkflowStep, WorkflowOperation } from "../core/workflow.ts";
import { validateWorkflow } from "../core/workflow.ts";
import { applyWorkflow, captureWorkflow, makeStep,reusablePaperParameters } from "../core/workflowEngine.ts";
import { createWorkflowBackup,readWorkflowBackup } from "../core/workflowBackup.ts";

const KEY = "prints:saved-workflows:v1";

interface Props {
  settings: ProjectSettings;
  assets: PhotoAsset[];
  recording: boolean;
  recordedSteps: WorkflowStep[];
  onStartRecording: () => void;
  onStopRecording: () => void;
  onApply: (settings: ProjectSettings, assets: PhotoAsset[], reviewNotes: string[]) => void;
  onError: (message: string) => void;
}

function loadLibrary(): SavedWorkflow[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter(validateWorkflow).slice(0, 100) : [];
  } catch {
    return [];
  }
}

export default function WorkflowPanel({
  settings, assets, recording, recordedSteps, onStartRecording, onStopRecording, onApply, onError,
}: Props) {
  const [library, setLibrary] = useState<SavedWorkflow[]>(loadLibrary);
  const [activeId, setActiveId] = useState<string>("");
  const importRef=useRef<HTMLInputElement>(null);
  const [name, setName] = useState("My print workflow");
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [targetId, setTargetId] = useState("all");
  const [operation, setOperation] = useState<"sheet.configure" | "crop.to-size" | "copies.set" |
    "crop.center" | "image.adjust" | "review.manual" | "sheet.compose">("crop.to-size");

  useEffect(() => {
    if (recording) setSteps(recordedSteps);
  }, [recordedSteps, recording]);

  function selectWorkflow(id: string) {
    setActiveId(id);
    const found = library.find((w) => w.id === id);
    if (found) { setName(found.name); setSteps(found.steps.map((s) => ({ ...s, parameters: { ...s.parameters } }))); }
  }

  function createNew() {
    const newWorkflow = captureWorkflow("New workflow", settings, assets[0]);
    setName(newWorkflow.name);
    setActiveId("");
    setSteps(newWorkflow.steps);
  }

  function addStep() {
    const a = assets[0];
    const parameters: WorkflowStep["parameters"] = operation === "sheet.configure"
      ? reusablePaperParameters(settings)
      : operation === "crop.to-size"
        ? { widthMm: a?.widthMm ?? 50.8, heightMm: a?.heightMm ?? 50.8 }
        : operation === "copies.set"
          ? { quantity: a?.quantity ?? 12 }
          : operation === "image.adjust"
            ? {brightness:a?.adjustments?.brightness??0,
              contrast:a?.adjustments?.contrast??0,
              saturation:a?.adjustments?.saturation??0}
          : operation === "crop.center"
            ? { focalX: 50, focalY: 50 }
            : operation === "review.manual"
              ? { message: "Inspect the resulting crop and mask before printing." }
              : {};
    setSteps((s) => [...s, makeStep(operation as WorkflowOperation, parameters,
      operation === "review.manual" ? "always" : "never")]);
  }

  function updateStep(id: string, transform: (s: WorkflowStep) => WorkflowStep) {
    setSteps((current) => current.map((s) => s.id === id ? transform(s) : s));
  }

  function saveWorkflow() {
    try {
      const id = activeId || crypto.randomUUID();
      const next: SavedWorkflow = {
        id, name: name.trim(), schemaVersion: 1, description: "Local saved processing workflow",
        updatedAt: new Date().toISOString(), steps,
      };
      if (!validateWorkflow(next)) throw new Error("Name or workflow step parameters are invalid.");
      const updated = [next, ...library.filter((w) => w.id !== id)];
      localStorage.setItem(KEY, JSON.stringify(updated));
      setLibrary(updated);
      setActiveId(id);
      onError("");
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not save this workflow.");
    }
  }

  function removeWorkflow() {
    if (!activeId) return;
    try {
      const updated = library.filter((w) => w.id !== activeId);
      localStorage.setItem(KEY, JSON.stringify(updated));
      setLibrary(updated);
      setActiveId(""); setSteps([]);
      onError("");
    } catch {
      onError("Could not delete workflow from this browser.");
    }
  }

  function downloadBackup() {
    try{
      const backup=createWorkflowBackup(library);
      const url=URL.createObjectURL(backup);
      const link=document.createElement("a");
      link.href=url;link.download="prints-workflows.json";
      document.body.append(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),30000);
      onError("");
    }catch(cause){onError(cause instanceof Error?cause.message:"Workflow backup failed.");}
  }
  async function importBackup(event:ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0];event.target.value="";
    if(!file)return;
    try{
      const recipes=await readWorkflowBackup(file);
      if(recipes.length+library.length>100)
        throw new Error("Workflow library limit reached (100 recipes). Delete old recipes first.");
      const updated=[...recipes,...library];
      localStorage.setItem(KEY,JSON.stringify(updated));
      setLibrary(updated);
      if(recipes[0])selectWorkflowDraft(recipes[0]);
      onError("");
    }catch(cause){
      onError(cause instanceof Error?cause.message:"Unable to import workflow backup.");
    }
  }
  function selectWorkflowDraft(workflow:SavedWorkflow){
    setActiveId(workflow.id);setName(workflow.name);
    setSteps(workflow.steps.map(step=>({...step,parameters:{...step.parameters}})));
  }
  function runWorkflow() {
    try {
      const doc: SavedWorkflow = {
        id: activeId || "unsaved", name: name.trim() || "Untitled workflow",
        schemaVersion: 1, description: "", updatedAt: new Date().toISOString(), steps,
      };
      const result = applyWorkflow(doc, {
        settings, assets, targetId: targetId === "all" ? null : targetId,
      });
      if (result.reviewNotes.length > 0 && !window.confirm(
        "This workflow requires manual review after applying:\n\n" +
        result.reviewNotes.join("\n") + "\n\nApply the changes and review before export?",
      )) return;
      onApply(result.settings, result.assets, result.reviewNotes);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Workflow could not be applied.");
    }
  }

  function shift(index: number, dir: number) {
    const destination = index + dir;
    if (destination < 0 || destination >= steps.length) return;
    setSteps((prev) => {
      const updated = [...prev];
      [updated[index], updated[destination]] = [updated[destination], updated[index]];
      return updated;
    });
  }

  return <section className="panel-section workflow-panel">
    <h3>Saved processing workflows</h3>
    <p className="hint">Reusable paper setup, sizing, copy counts and optional manual review. Photo-specific selections are never blindly copied to new images.</p>
    <label>Load workflow
      <select value={activeId} onChange={(event) => selectWorkflow(event.target.value)}>
        <option value="">Unsaved / new workflow</option>
        {library.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
    </label>
    <label>Workflow name
      <input type="text" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
    </label>
    <div className="action-stack">
      <button className="secondary-button" onClick={createNew}>New from current layout</button>
      {!recording ? <button className="secondary-button" onClick={() => { setSteps([]); setActiveId(""); onStartRecording(); }}>
        ● Start recording edits</button>
        : <button className="primary-button" onClick={onStopRecording}>■ Stop recording ({recordedSteps.length} steps)</button>}
    </div>
    <div className="workflow-step-list" aria-label="Workflow steps">
      {steps.length === 0 && <p className="hint">Add a step or record layout edits to build a workflow.</p>}
      {steps.map((s, index) => <div className="workflow-step" key={s.id}>
        <div className="workflow-step-title">
          <label className="check-row"><input type="checkbox" checked={s.enabled}
            onChange={(e) => updateStep(s.id, (v) => ({ ...v, enabled: e.target.checked }))} />
            {index + 1}. {s.operation}</label>
          <div className="step-buttons">
            <button disabled={index === 0} onClick={() => shift(index, -1)} aria-label="Move step up">↑</button>
            <button disabled={index === steps.length - 1} onClick={() => shift(index, 1)} aria-label="Move step down">↓</button>
            <button onClick={() => setSteps((old) => old.filter((v) => v.id !== s.id))} aria-label="Remove step">×</button>
          </div>
        </div>
        {Object.entries(s.parameters).map(([key, value]) => <label key={key}>{key}
          {typeof value === "boolean" ? <input type="checkbox" checked={value}
              onChange={(e) => updateStep(s.id, (v) => ({
                ...v, parameters: { ...v.parameters, [key]: e.target.checked },
              }))} />
            : <input type={typeof value === "number" ? "number" : "text"} step="any"
              value={value === null ? "" : String(value)}
              onChange={(e) => updateStep(s.id, (v) => ({
                ...v, parameters: { ...v.parameters, [key]: typeof value === "number"
                  ? Number(e.target.value) : e.target.value },
              }))} />}
        </label>)}
        <label>Review policy
          <select value={s.reviewMode} onChange={(e) => updateStep(s.id, (v) =>
            ({ ...v, reviewMode: e.target.value as WorkflowStep["reviewMode"] }))}>
            <option value="never">No review gate</option>
            <option value="always">Review required</option>
            <option value="on-uncertainty">Review when uncertain</option>
          </select>
        </label>
      </div>)}
    </div>
    <label>Manually add step
      <select value={operation} onChange={(e) => setOperation(
        e.target.value as typeof operation,
      )}>
        <option value="sheet.configure">Paper setup</option>
        <option value="crop.to-size">Output image size</option>
        <option value="copies.set">Copy quantity</option>
        <option value="crop.center">Framing offset</option>
        <option value="image.adjust">Photo brightness / contrast / saturation</option>
        <option value="review.manual">Manual review</option>
        <option value="sheet.compose">Recompose sheet</option>
      </select>
    </label>
    <button className="secondary-button" onClick={addStep}>+ Add step</button>
    <label>Apply to
      <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
        <option value="all">All images (batch)</option>
        {assets.map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}
      </select>
    </label>
    <div className="action-stack">
      <button className="primary-button" disabled={steps.length === 0 || recording} onClick={runWorkflow}>Apply workflow</button>
      <button className="secondary-button" disabled={steps.length === 0} onClick={saveWorkflow}>Save workflow</button>
      <button className="secondary-button" disabled={!activeId} onClick={removeWorkflow}>Delete saved workflow</button>
    </div>
    <details className="advanced-options"><summary>Workflow library backup</summary>
      <div className="action-stack">
        <button className="secondary-button" disabled={library.length===0}
          onClick={downloadBackup}>Download workflow backup</button>
        <button className="secondary-button" onClick={()=>importRef.current?.click()}>
          Import workflow backup</button>
        <input className="visually-hidden" ref={importRef} type="file"
          accept=".json,application/json" aria-label="Import workflow library"
          onChange={event=>void importBackup(event)}/>
      </div>
      <p className="hint">Recipes are validated on import and receive new IDs. Existing recipes are preserved.</p>
    </details>
    <p className="hint">AI segmentation and vector/text editing workflow actions are not yet executable. No photos leave your browser.</p>
  </section>;
}
