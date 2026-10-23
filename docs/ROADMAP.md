# Delivery roadmap and release gates

> **Current implementation update — 24 October 2026:** Many tasks listed below under V0.1/V0.2 already have working implementations. The original sections are retained as a *historical delivery plan*, not a feature-status claim. The current [implementation/audit handbook](CURRENT_STATE_2026-10-24.md) and [release acceptance matrix](RELEASE_ACCEPTANCE_2026-10-23.md) supersede their tense and dates. Immediate milestones are real-browser source recovery and thumbnail fault-isolation acceptance; Android/iOS print/edit/back testing; true A3 600-DPI memory/print proof; model executable/license checksum provenance; ZIP crash/quota tests; complex-script typography; and independently verified physical geometry. No green build substitutes for those release gates.


The original sections below describe the sequence of milestones and do not necessarily reflect present-day implementation status.

**October 23, 2026 update:** The main UI now contains implemented components for Advanced Photo Studio, on-device AI segmentation (opt-in), Smart ID Studio, local typography/font embedding, optimized sheet packing, full-resolution exports, draft recovery and portable ZIP backups. The remaining work is independent visual/pixel verification, browser and constrained-device acceptance, model provenance/licensing, physically measured printer proofs, advanced Unicode shaping and other gaps listed in [release acceptance](RELEASE_ACCEPTANCE_2026-10-23.md). A READY Vercel build is a necessary automated gate—not a substitute for these checks.

## Foundation PR (this change)
- Establish product purpose, requirements, architecture, workflow and quality documents.
- Scaffold typed web app with honest feature status and reproducible commands.
- Deliver first functional local sheet composer (upload, physical item sizes, quantities, paper, margins, preview and basic PDF output), with geometry tests.
- Keep original uploaded files on-device. Advanced editing/workflows/AI remain planned.

## V0.1A — Core Studio
- Crop controls, basic transparent background mask cleaning, nondestructive reversible edits and layer-based text/shape design editing.
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
