# PRINTS

**PRINTS** is a local-first, offline-capable web application for turning images and editable designs into precisely sized, paper-efficient print jobs.

The product is intended for both individuals and print shop operators. Its principal workflow is **Import → Edit / Crop → Compose → Preview → Export / Print**. A related **Workflow Studio** will let users record or manually define reusable processing steps, repeat previous jobs, and process batches.

## Product pillars

1. **Design Studio** — nondestructive image crops and adjustments, editable layers, text and shapes, optional offline background removal and mask refinement.
2. **Workflow Studio** — saved and recorded processing sequences, manual review steps, repeat-last-job, and batch execution.
3. **Print Studio** — standard/custom paper, exact physical dimensions, repeats and mixed-product layouts, trim guides, and print-ready PDF export.
4. **Local-first privacy** — no mandatory account or customer ordering system; source photos remain on-device by default.

## Initial delivery approach

- **V0.1A:** project foundation; paper geometry; sheet composer; core crop/edit tools; PDF export; offline shell; local project and workflow persistence.
- **V0.1B:** advanced workflow recording, batch execution/review, offline background removal, mask refinement, portrait positioning.
- **V0.2+:** richer templates, print calibration, more capable layout optimization, and advanced production tools.

Implementation status and limitations must be distinguished from planned features. The initial bootstrap commit creates the repository baseline; subsequent work establishes the code and detailed documentation.

## Non-negotiable principles

- Measure print layouts in **millimeters**; convert to PDF points only at export.
- Avoid silent upscaling; report effective resolution and printer-scale limitations.
- Preserve original assets and support reversible edits.
- Preview and output must share one geometry model.
- Offline operation should not depend on uploading private photographs.
- Workflow steps should store semantic operations rather than raw mouse gestures.
- Do not introduce order management, payment handling, or mandatory cloud accounts into the initial scope.

## Status

Planning and initial implementation are underway. Features listed as planned are **not** assertions that they work today.

Repository: https://github.com/ariz31/prints
