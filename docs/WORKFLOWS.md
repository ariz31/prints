# PRINTS — workflow runtime and future capabilities

**Updated 24 October 2026.** [Current-state handbook](CURRENT_STATE_2026-10-24.md) is authoritative for which workflow features are shipped.

## Supported workflow operations

The application stores versioned, semantic workflow definitions in the local browser. A workflow is not a project backup, arbitrary macro, execution script or remote AI agent. Operators can capture print settings, add/edit/reorder/enable/disable steps, record supported actions, save/reopen workflow definitions and apply them to one photo or a set of images with review notes.

| Step | Implemented behavior |
| --- | --- |
| `sheet.configure` | Sets validated paper, orientation, margin, gap, cut guides and supported composition settings |
| `crop.to-size` | Changes physical item size and reframes within a validated photo crop |
| `crop.center` | Uses a supported framing parameter plus review notice; never silently reuses source-specific crop pixels |
| `copies.set` | Sets bounded copy counts for the intended items |
| `sheet.compose` | Recomputes deterministic page placement, including supported packing options |
| `review.manual` | Presents an operator-facing checkpoint before a workflow is applied |

Unsupported steps such as `image.remove-background`, `image.replace-background`, `image.adjust`, `design.add-text` and `export.pdf` are explicitly rejected by the workflow engine. Equivalent manual editor features being available elsewhere does **not** mean these steps are executable by workflows.

## Persistence and boundaries

- Workflows and named layout presets live in browser localStorage; source images and full projects live in IndexedDB.
- Workflow settings and saved projects use separate models. Portable project ZIP/JSON backups do not by themselves mean arbitrary workflow scripts can be restored or migrated.
- Recorded actions are domain operations, not unrepeatable pointer coordinates. Photo-specific local masks/face boundaries are not blindly reused on new files.
- Current review is a pre-application confirmation, not a true pause-and-resume, stepwise human-in-the-loop execution engine.
- A failed image or canceled project operation should not cause silent modification of other photos. Individual thumbnail errors are handled separately; that is not a complete workflow batch retry engine.

## Next development targets (not yet shipped as workflow operations)

Per-item workflow pause/review/resume and retry, independently validated batch job queues, optional consented model-backed steps, richer layer/template operations, reversible workflow history, and import/export of a standalone versioned workflow library. Each requires unit tests, representative browser fixtures and explicit source ownership rules before adding to the supported-operation set.

## Safety and acceptance

Validate step parameters and numeric limits, reject unknown step types, keep source bytes immutable and physical mm geometry authoritative. Compare the generated output against the preview and require actual device/print acceptance for released automated workflows. Consult [Quality](QUALITY.md) and [current-state audit](CURRENT_STATE_2026-10-24.md).
