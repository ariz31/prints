import assert from "node:assert/strict";
import test from "node:test";
import { validateWorkflow } from "./workflow.ts";

test("accepts a semantic, versioned workflow definition", () => {
  assert.equal(validateWorkflow({
    schemaVersion: 1, id: "id-photo", name: "2x2", description: "",
    updatedAt: "2026-10-19T00:00:00Z",
    steps: [{ id: "crop", operation: "crop.to-size", enabled: true,
      reviewMode: "always", parameters: { widthMm: 50.8, heightMm: 50.8 } }],
  }), true);
});

test("rejects unsupported versions, duplicate step ids and unknown actions", () => {
  const basic = { schemaVersion: 1, id: "id-photo", name: "2x2", description: "",
    updatedAt: "2026-10-19T00:00:00Z", steps: [] as unknown[] };
  assert.equal(validateWorkflow({ ...basic, schemaVersion: 2 }), false);
  const step = { id: "1", operation: "export.pdf", enabled: true, reviewMode: "never", parameters: {} };
  assert.equal(validateWorkflow({ ...basic, steps: [step, step] }), false);
  assert.equal(validateWorkflow({ ...basic, steps: [{ ...step, operation: "script.execute" }] }), false);
  assert.equal(validateWorkflow({ ...basic, steps: [{ ...step, parameters: { x: Infinity } }] }), false);
});
