import { validateWorkflow } from "./workflow.ts";
import { fitCropToAspect } from "./crop.ts";
import { validPhotoAdjustments } from "./photoAdjustments.ts";
import type { SavedWorkflow, WorkflowStep, WorkflowOperation } from "./workflow.ts";
import type { PhotoAsset } from "./exportPdf.ts";
import type { ProjectSettings } from "./projectStore.ts";

export interface WorkflowInput {
  settings: ProjectSettings;
  assets: PhotoAsset[];
  targetId?: string | null;
}
export interface WorkflowResult {
  settings: ProjectSettings;
  assets: PhotoAsset[];
  reviewNotes: string[];
}

function finitePositive(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("Invalid workflow parameter: " + label);
  }
  return value;
}
function finiteNonnegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("Invalid workflow parameter: " + label);
  }
  return value;
}
function limitedQuantity(value: unknown): number {
  const n = finitePositive(value, "quantity");
  if (!Number.isSafeInteger(n) || n > 1000) throw new Error("Quantity must be an integer from 1 to 1,000.");
  return n;
}

export function makeStep(
  operation: WorkflowOperation,
  parameters: WorkflowStep["parameters"] = {},
  reviewMode: WorkflowStep["reviewMode"] = "never",
): WorkflowStep {
  return { id: crypto.randomUUID(), operation, enabled: true, reviewMode, parameters };
}

export function captureWorkflow(
  name: string, settings: ProjectSettings, item?: PhotoAsset,
): SavedWorkflow {
  const steps = [makeStep("sheet.configure", { ...settings })];
  if (item) {
    steps.push(makeStep("crop.to-size", { widthMm: item.widthMm, heightMm: item.heightMm }));
    steps.push(makeStep("copies.set", { quantity: item.quantity }));
    steps.push(makeStep("review.manual",
      { message: "Inspect crop framing and subject position for the replacement image." }, "always"));
  }
  steps.push(makeStep("sheet.compose"));
  return {
    schemaVersion: 1, id: crypto.randomUUID(), name: name.trim() || "Untitled workflow",
    description: "Reusable local print-production settings", updatedAt: new Date().toISOString(), steps,
  };
}

/** Replace adjacent same-kind recorder events with the latest full configuration. */
export function recordSemanticStep(history: readonly WorkflowStep[], next: WorkflowStep): WorkflowStep[] {
  const previous = history.at(-1);
  if (previous && previous.operation === next.operation && previous.reviewMode === next.reviewMode) {
    return [...history.slice(0, -1), { ...next, id: previous.id }];
  }
  return [...history, next];
}

/**
 * Supported operations only; never silently execute unknown future AI/editing steps.
 * The caller must surface reviewNotes and obtain review before treating the job as approved.
 */
export function applyWorkflow(workflow: SavedWorkflow, input: WorkflowInput): WorkflowResult {
  if (!validateWorkflow(workflow)) throw new Error("Workflow is invalid or unsupported.");
  let settings = { ...input.settings };
  let assets = input.assets.map((a) => ({ ...a }));
  const reviewNotes: string[] = [];
  const updateTargets = (change: (a: PhotoAsset) => PhotoAsset) => {
    assets = assets.map((a) => input.targetId && a.id !== input.targetId ? a : change(a));
  };
  for (const step of workflow.steps) {
    if (!step.enabled) continue;
    const p = step.parameters;
    switch (step.operation) {
      case "sheet.configure": {
        const next = {
          paper: p.paper,
          orientation: p.orientation,
          customWidthMm: p.customWidthMm,
          customHeightMm: p.customHeightMm,
          marginMm: p.marginMm,
          gapMm: p.gapMm,
          cutGuides: p.cutGuides,
          packing: p.packing,
        };
        if (typeof next.paper !== "string" || typeof next.orientation !== "string" ||
          !["A4", "A3", "Letter", "Legal", "Long Bond", "Custom"].includes(next.paper) ||
          !["portrait", "landscape"].includes(next.orientation) || typeof next.cutGuides !== "boolean") {
          throw new Error("Workflow paper configuration is invalid.");
        }
        settings = {
          paper: next.paper as ProjectSettings["paper"],
          orientation: next.orientation as ProjectSettings["orientation"],
          customWidthMm: finitePositive(next.customWidthMm, "paper width"),
          customHeightMm: finitePositive(next.customHeightMm, "paper height"),
          marginMm: finiteNonnegative(next.marginMm, "margin"),
          gapMm: finiteNonnegative(next.gapMm, "gap"),
          cutGuides: next.cutGuides,
          packing: next.packing===undefined?"compact":
            next.packing==="ordered"||next.packing==="compact"?next.packing:
            (()=>{throw new Error("Invalid workflow packing setting.")})(),
        };
        break;
      }
      case "crop.to-size": {
        const widthMm = finitePositive(p.widthMm, "crop width");
        const heightMm = finitePositive(p.heightMm, "crop height");
        updateTargets((a) => ({
          ...a, widthMm, heightMm,
          crop: fitCropToAspect(a.crop,a.processedWidth??a.pixelWidth,
            a.processedHeight??a.pixelHeight,widthMm,heightMm),
        }));
        break;
      }
      case "image.adjust": {
        const adjustment={brightness:p.brightness,contrast:p.contrast,saturation:p.saturation};
        if(!validPhotoAdjustments(adjustment))
          throw new Error("Invalid photo adjustments in workflow.");
        updateTargets(a=>({...a,adjustments:adjustment}));
        break;
      }
      case "copies.set": {
        const quantity = limitedQuantity(p.quantity);
        updateTargets((a) => ({ ...a, quantity }));
        break;
      }
      case "crop.center": {
        const x = finiteNonnegative(p.focalX, "horizontal framing");
        const y = finiteNonnegative(p.focalY, "vertical framing");
        if (x > 100 || y > 100) throw new Error("Framing percent must be between 0 and 100.");
        updateTargets((a) => ({ ...a, focalX: x, focalY: y }));
        reviewNotes.push("Verify the subject framing of the replacement image.");
        break;
      }
      case "sheet.compose":
        // Current sheet layout is derived from the live project dimensions by the composer.
        break;
      case "review.manual":
        reviewNotes.push(String(p.message ?? "Inspect the result before export."));
        break;
      default:
        throw new Error("This workflow contains an operation not executable in the current release: " + step.operation);
    }
    if (step.reviewMode === "always" && step.operation !== "review.manual") {
      reviewNotes.push("Review step: " + step.operation);
    }
  }
  return { settings, assets, reviewNotes };
}
