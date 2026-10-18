import assert from "node:assert/strict";
import test from "node:test";
import { applyWorkflow, recordSemanticStep } from "./workflowEngine.ts";
import type { WorkflowStep, SavedWorkflow } from "./workflow.ts";
import type { PhotoAsset } from "./exportPdf.ts";

const settings = {
  paper: "A4" as const, orientation: "portrait" as const, customWidthMm: 210,
  customHeightMm: 297, marginMm: 5, gapMm: 3, cutGuides: true,
};
const assets: PhotoAsset[] = [
  { id: "a", name: "a.png", url: "blob:a", pixelWidth: 1000, pixelHeight: 1000,
    crop: { x: 0.1, y: 0.1, width: 0.6, height: 0.6 }, widthMm: 20,
    heightMm: 20, quantity: 2, focalX: 50, focalY: 50 },
  { id: "b", name: "b.png", url: "blob:b", pixelWidth: 500, pixelHeight: 500,
    crop: { x: 0, y: 0, width: 1, height: 1 }, widthMm: 20,
    heightMm: 20, quantity: 2, focalX: 50, focalY: 50 },
];
const step = (id: string, operation: WorkflowStep["operation"], parameters: WorkflowStep["parameters"]): WorkflowStep =>
  ({ id, operation, parameters, reviewMode: "never", enabled: true });

test("replay applies semantic sizes and quantities to a selected image only", () => {
  const workflow: SavedWorkflow = { id: "w", name: "2x2", description: "",
    updatedAt: "", schemaVersion: 1, steps: [
      step("one", "crop.to-size", { widthMm: 50.8, heightMm: 50.8 }),
      step("two", "copies.set", { quantity: 12 }),
    ] };
  const out = applyWorkflow(workflow, { settings, assets, targetId: "b" });
  assert.equal(out.assets[0].widthMm, 20);
  assert.equal(out.assets[1].widthMm, 50.8);
  assert.equal(out.assets[1].quantity, 12);
  assert.deepEqual(out.assets[0].crop, assets[0].crop);
  assert.deepEqual(out.assets[1].crop, assets[1].crop);
});

test("unsupported AI action cannot be falsely reported as processed", () => {
  const workflow: SavedWorkflow = { id: "w", name: "AI", description: "",
    updatedAt: "", schemaVersion: 1, steps: [step("one", "image.remove-background", {})] };
  assert.throws(() => applyWorkflow(workflow, { settings, assets }), /not executable/);
});
test("invalid quantity and review steps", () => {
  const workflow: SavedWorkflow = { id: "w", name: "review", description: "", updatedAt: "",
    schemaVersion: 1, steps: [step("one", "copies.set", { quantity: 0 })] };
  assert.throws(() => applyWorkflow(workflow, { settings, assets }), /Invalid workflow parameter/);
  workflow.steps = [step("one", "review.manual", { message: "Check ID alignment" })];
  assert.deepEqual(applyWorkflow(workflow, { settings, assets }).reviewNotes, ["Check ID alignment"]);
});

test("recording compacts consecutive same-kind settings", () => {
  const one = step("one", "copies.set", { quantity: 1 });
  const two = step("two", "copies.set", { quantity: 2 });
  assert.deepEqual(recordSemanticStep([one], two),
    [{ ...two, id: "one" }]);
});
