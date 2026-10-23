import { validateWorkflow } from "./workflow.ts";
import { fitCropToAspect } from "./crop.ts";
import { validPhotoAdjustments } from "./photoAdjustments.ts";
import type { SavedWorkflow, WorkflowStep, WorkflowOperation } from "./workflow.ts";
import type { PhotoAsset } from "./exportPdf.ts";
import type { ProjectSettings } from "./projectStore.ts";
import {validProjectSettings} from "./projectStore.ts";

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

export function reusablePaperParameters(settings:ProjectSettings):WorkflowStep["parameters"]{
  return {
    paper:settings.paper,orientation:settings.orientation,
    customWidthMm:settings.customWidthMm,customHeightMm:settings.customHeightMm,
    marginMm:settings.marginMm,gapMm:settings.gapMm,cutGuides:settings.cutGuides,
    ...(settings.packing?{packing:settings.packing}:{}),
    ...(settings.pdfDpi?{pdfDpi:settings.pdfDpi}:{}),
    ...(settings.autoRotate===true?{autoRotate:true}:{}),
    ...(settings.trimStyle?{trimStyle:settings.trimStyle}:{})
  };
}

export function captureWorkflow(
  name: string, settings: ProjectSettings, item?: PhotoAsset,
): SavedWorkflow {
  const steps = [makeStep("sheet.configure", reusablePaperParameters(settings))];
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
          pdfDpi: p.pdfDpi,
          autoRotate: p.autoRotate,
          trimStyle: p.trimStyle,
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
          // Manual per-copy coordinates never replay across different source images.
          manualPlacements:[],
          pdfDpi:next.pdfDpi===undefined?300:next.pdfDpi===300||next.pdfDpi===600?next.pdfDpi:
            (()=>{throw new Error("Invalid workflow PDF quality setting.");})(),
          autoRotate: next.autoRotate===undefined?false:next.autoRotate===true?true:
            (()=>{throw new Error("Invalid workflow rotation setting.");})(),
          trimStyle:next.trimStyle===undefined?"outline":
            next.trimStyle==="outline"||next.trimStyle==="corner"?next.trimStyle:
            (()=>{throw new Error("Invalid cut-mark style.");})(),
          packing: next.packing===undefined?"compact":
            next.packing==="ordered"||next.packing==="compact"||next.packing==="optimized"?next.packing:
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
        const adjustment:Record<string,unknown>={
          brightness:p.brightness,contrast:p.contrast,saturation:p.saturation,
        };
        // Legacy recorded workflows retain three fields. New workflows may
        // include optional, validated Photo Studio settings.
        for(const key of ["schemaVersion","exposure","highlights","shadows","whites","blacks",
          "temperature","tint","vibrance","sharpness","denoise","grayscale",
          "vignette","rotation","straighten","flipX","flipY","backgroundColor"]){
          if(Object.hasOwn(p,key))adjustment[key]=p[key];
        }
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
        // Visible crop coordinates, not legacy cover-crop focal metadata,
        // control the real preview, PNG and PDF output.
        updateTargets((a) => {
          const crop=fitCropToAspect(a.crop,a.processedWidth??a.pixelWidth,
            a.processedHeight??a.pixelHeight,a.widthMm,a.heightMm);
          return {...a,focalX:x,focalY:y,crop:{
            ...crop,x:(1-crop.width)*x/100,y:(1-crop.height)*y/100,
          }};
        });
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
  // Validate the entire batch before publishing any step. Workflows can be
  // imported from a file and must not bypass normal editor size protections.
  if(!validProjectSettings(settings))
    throw new Error("Workflow produces invalid paper settings. Width/height must be positive and no larger than 2000 mm; margins and gaps may be zero.");
  if(assets.some(a=>!Number.isFinite(a.widthMm)||a.widthMm<=0||a.widthMm>2000||
    !Number.isFinite(a.heightMm)||a.heightMm<=0||a.heightMm>2000||
    !Number.isSafeInteger(a.quantity)||a.quantity<1||a.quantity>1000))
    throw new Error("Workflow produces invalid image dimensions or copy counts.");
  // Each asset's quantity is valid independently, but a workflow must not
  // commit a batch that the sheet composer will refuse or ambiguously identify.
  const ids=new Set<string>();
  let totalCopies=0;
  for(const asset of assets){
    if(typeof asset.id!=="string"||!asset.id.trim()||asset.id.length>200||ids.has(asset.id))
      throw new Error("Workflow produced duplicate or missing design IDs.");
    ids.add(asset.id);
    totalCopies+=asset.quantity;
    if(totalCopies>1000)
      throw new Error("Workflow exceeds the 1,000-copy print job limit. Reduce quantities before applying.");
  }
  return { settings, assets, reviewNotes };
}
