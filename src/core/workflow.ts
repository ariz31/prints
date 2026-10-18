/** Planned semantic workflow contract. No general-purpose executor is implemented yet. */
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
  "crop.to-size", "crop.center", "copies.set", "image.adjust", "image.remove-background", "image.replace-background",
  "design.add-text", "sheet.configure", "sheet.compose", "export.pdf", "review.manual",
];

export function validateWorkflow(candidate: unknown): candidate is SavedWorkflow {
  if (typeof candidate !== "object" || candidate === null) return false;
  const w = candidate as Record<string, unknown>;
  if (w.schemaVersion !== 1 || typeof w.id !== "string" || !w.id ||
      typeof w.name !== "string" || !w.name || typeof w.description !== "string" ||
      typeof w.updatedAt !== "string" || !Array.isArray(w.steps) || w.steps.length > 100) return false;
  const ids = new Set<string>();
  return w.steps.every((value) => {
    if (typeof value !== "object" || value === null) return false;
    const s = value as Record<string, unknown>;
    if (typeof s.id !== "string" || !s.id || ids.has(s.id)) return false;
    ids.add(s.id);
    if (!WORKFLOW_OPERATIONS.includes(s.operation as WorkflowOperation) ||
        typeof s.enabled !== "boolean" || !["never", "always", "on-uncertainty"].includes(String(s.reviewMode)) ||
        typeof s.parameters !== "object" || s.parameters === null || Array.isArray(s.parameters)) return false;
    const values = Object.values(s.parameters);
    return values.length <= 50 && values.every((v) => v === null || typeof v === "boolean" ||
      typeof v === "string" || (typeof v === "number" && Number.isFinite(v)));
  });
}
