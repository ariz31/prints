/** Planned semantic workflow contract. */
export type WorkflowOperation =
  | "crop.to-size"
  | "crop.center"
  | "copies.set"
  | "image.adjust"
  | "image.remove-background"
  | "image.replace-background"
  | "design.add-text"
  | "sheet.configure"
  | "sheet.compose"
  | "export.pdf"
  | "review.manual";

export type ReviewMode = "never" | "always" | "on-uncertainty";

export interface WorkflowStep {
  id: string;
  operation: WorkflowOperation;
  enabled: boolean;
  reviewMode: ReviewMode;
  parameters: Record<string, string | number | boolean | null>;
}

export interface SavedWorkflow {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  steps: WorkflowStep[];
}

export const WORKFLOW_OPERATIONS: ReadonlyArray<WorkflowOperation> = [
  "crop.to-size",
  "crop.center",
  "copies.set",
  "image.adjust",
  "image.remove-background",
  "image.replace-background",
  "design.add-text",
  "sheet.configure",
  "sheet.compose",
  "export.pdf",
  "review.manual",
];

export const REVIEW_MODES: ReadonlyArray<ReviewMode> = [
  "never",
  "always",
  "on-uncertainty",
];

export function validateWorkflow(candidate: unknown): candidate is SavedWorkflow {
  try {
    if (typeof candidate !== "object" || candidate === null) return false;
    const w = candidate as Record<string, unknown>;
    if (
      w.schemaVersion !== 1 ||
      typeof w.id !== "string" ||
      !w.id ||
      typeof w.name !== "string" ||
      !w.name ||
      typeof w.description !== "string" ||
      typeof w.updatedAt !== "string" ||
      !Array.isArray(w.steps) ||
      w.steps.length > 100
    ) {
      return false;
    }
    const ids = new Set<string>();
    for (let i = 0; i < w.steps.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(w.steps, i)) {
        return false;
      }
      const value = w.steps[i];
      if (typeof value !== "object" || value === null) return false;
      const s = value as Record<string, unknown>;
      if (typeof s.id !== "string" || !s.id || ids.has(s.id)) return false;
      ids.add(s.id);
      if (
        typeof s.operation !== "string" ||
        !WORKFLOW_OPERATIONS.includes(s.operation as WorkflowOperation) ||
        typeof s.enabled !== "boolean" ||
        typeof s.reviewMode !== "string" ||
        !["never", "always", "on-uncertainty"].includes(s.reviewMode) ||
        typeof s.parameters !== "object" ||
        s.parameters === null ||
        Array.isArray(s.parameters)
      ) {
        return false;
      }
      const values = Object.values(s.parameters as Record<string, unknown>);
      if (values.length > 50) return false;
      for (let j = 0; j < values.length; j++) {
        const v = values[j];
        if (
          v !== null &&
          typeof v !== "boolean" &&
          typeof v !== "string" &&
          !(typeof v === "number" && Number.isFinite(v))
        ) {
          return false;
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}
