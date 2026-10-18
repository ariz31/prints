# Delivery roadmap and release gates

All milestones are aspirational until corresponding tests and UI functionality have been verified.

## Foundation PR (this change)
- Establish product purpose, requirements, architecture, workflow and quality documents.
- Scaffold typed web app with honest feature status and reproducible commands.
- Deliver first functional local sheet composer (upload, physical item sizes, quantities, paper, margins, preview and basic PDF output), with geometry tests.
- Keep original uploaded files on-device. Advanced editing/workflows/AI remain planned.

## V0.1A — Core Studio
- Crop controls, nondestructive reversible edits and layer-based text/shape design editing.
- Save/reopen complete projects and source assets with IndexedDB; portable backups.
- Mixed-item composer, repeat layout, manual rearrange, reliable pagination, trim and export options.
- Template library, workflow step builder, repeat-last-job, offline installable shell.
- Required acceptance: accurate PDF dimensions; undo/redo and reopening stable; tested offline after cache warm-up.

## V0.1B — Automation and AI
- Record supported semantic editor actions; edit sequence and review gates.
- Execute batches with progress, cancel, retry and resource limits.
- On-device background removal, background replacement and manual mask refinement.
- Portrait positioning and conservative enhancement with human override.
- Required acceptance: offline cached model works on supported hardware; same-image replay consistent; new-image workflow does not silently reuse stale crop coordinates.

## V0.2 — Production quality
- More effective mixed-size packing, rotation and manual imposition.
- Export naming profiles, batch troubleshooting, richer adjustment tools, improved template organization.
- Printer calibration pages and duplex registration guidance.

## V0.3+ — Advanced printing
- CSV/variable data templates, optional vector-focused exports, irregular cutter layouts and expanded production presets.
- No cloud orders/payment/accounts without a separate product decision.

## Excluded for now
Hosted image storage, customer order intake, POS/checkout, background remote processing, external integrations, workflow scripting and printers controlled directly from cloud services.

## Merge gates
Typecheck, builds, unit tests for geometry and operations, automated PDF sizing checks, accessible UI smoke checks and a frank manual verification matrix. Do not describe a feature as implemented without testing it.
