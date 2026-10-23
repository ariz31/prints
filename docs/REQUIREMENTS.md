# Functional and nonfunctional requirements

> **Live implementation and verification — 24 October 2026:** The identifiers below are *normative requirements*, not a complete list of shipped features. The previous phrase “Status: planned unless explicitly implemented” describes the original specification and is not an up-to-date inventory. The authoritative feature status and remaining field tests are in [Current state](CURRENT_STATE_2026-10-24.md) and [Release acceptance](RELEASE_ACCEPTANCE_2026-10-23.md). Implemented in code: JPG/PNG/WebP import, fixed crop, normalized edits, manual and opt-in consented background processing, Smart ID variants, mixed-size packing, 300/600-DPI tiled PDF/PNG, local font support, IndexedDB/ZIP recovery, PWA and supported semantic workflows. **Partial/not certified:** canvas grouping/locking, comprehensive eye landmarks, workflow per-item pause/retry and advanced unsupported steps, multi-crop source objects, complex Unicode shaping, AI provider digest/licensing and physical printer/device results. Distinguish code presence from full nonfunctional acceptance.


Priority: P0 = V0.1 scope; P1 = refinement; P2 = later. Status: planned unless explicitly implemented.

## Design Studio
- DS-01 [P0] Import PNG, JPEG and WebP through file input/drag-and-drop; keep originals unchanged.
- DS-02 [P0] Adjust source framing/crop without baking irreversible source changes; exact dimensions and aspect ratios.
- DS-03 [P0] Layered editor: images, editable text and basic geometric shapes; select, reorder, group, lock, hide, duplicate and undo/redo.
- DS-04 [P0] Rotation, flip, resize, and fundamental tonal adjustments with reliable previews.
- DS-05 [P0] Automatic local-device background removal, replace with transparent/solid background, manual brush erase/restore and edge refinement.
- DS-06 [P0] Face-aware portrait alignment and non-destructive enhancement; permit manual correction; never silently alter identity.
- DS-07 [P1] Multiple crop selections per original, noise removal, sharpen, comparison view and batch conversions.

## Print Studio
- PS-01 [P0] Support A4, A3, Letter, Legal, long bond and user-entered sizes, with portrait/landscape orientation.
- PS-02 [P0] Precisely sized repeated copies and mixed items with independent quantities on one or multiple sheets.
- PS-03 [P0] Paper margins, item spacing, optional visible cutting/trim guides.
- PS-04 [P0] Deterministic, overlap-free sheet layout that never lets an item extend outside configured margins.
- PS-05 [P0] Preview derived from the same geometry as the export; no dependency on browser screen scaling.
- PS-06 [P0] Export PDF with correct page sizes; expose DPI warnings and actual-size print guidance.
- PS-07 [P1] Better mixed-size packing, item rotation, manual overrides, rulers, snapping, bleed and safe zones.
- PS-08 [P1] Save/restore export profiles and reusable product presets.

## Workflow Studio
- WF-01 [P0] Build sequential workflows manually with typed and versioned operations.
- WF-02 [P0] Record supported semantic editing actions into the same format; unsupported actions prompt a review step.
- WF-03 [P0] Reorder, enable/disable, parameterize and duplicate workflow steps.
- WF-04 [P0] Save, reopen and run workflows on one source or a batch; allow cancel/retry per item.
- WF-05 [P0] Insert optional review gates for uncertain crop/mask/portrait alignment; never guess without signaling.
- WF-06 [P0] Repeat last job using replacement source(s), recomputing content-dependent crop coordinates.
- WF-07 [P1] Workflow import/export, version migrations, saved naming profiles and run summaries.
- WF-08 [P2] Conditional branching, triggers and scripting (out of initial scope).

## Local-first operation
- LF-01 [P0] No required account; no default image upload or server-side processing.
- LF-02 [P0] Persist projects, originals and workflows in locally available storage; warn about storage quotas and provide backup/export.
- LF-03 [P0] Installable PWA shell and offline editing/export after necessary assets have been cached.
- LF-04 [P0] AI model distribution must disclose first-use downloads and support offline reuse on compatible devices.
- LF-05 [P1] Restore incomplete jobs and migrate versioned stored data without silent loss.

## Nonfunctional acceptance
- Units: authoritative positions and physical sizes in mm; PDF coordinates in points.
- No implicit resizing that breaks aspect ratio or print dimensions.
- Validation of impossible item sizes and invalid margins rather than overflow/hanging.
- Memory-aware batch execution with cancel/retry; failed individual items do not corrupt completed outputs.
- Keyboard-accessible controls, descriptive form labels and responsive layout.
- Build, lint/typecheck, unit, PDF geometry and browser smoke tests; test both online/offline cases.
- No production features described as finished until independently verified.

## Scope boundary
Not in early releases: checkout, orders, payment handling, user accounts, cloud sync, hosting user photos, unattended printing, conditional workflow scripting.
