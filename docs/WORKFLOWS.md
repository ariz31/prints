# Saved workflows — specification

## Purpose
A workflow stores how a print job was processed, not the original customer photograph. It should let the operator process new source files in the same manner with fewer repetitive decisions.

## Create
- Manual builder: add typed steps, edit parameter forms, reorder, disable, duplicate and name.
- Recorder: capture supported user intent (e.g. set crop aspect ratio, apply exposure, replace background, choose sheet, place N copies). Never replay mouse coordinates, hover, scrolling or UI zoom.
- Save a versioned workflow separate from project and template storage.

## Run
Select a workflow; provide one image or a batch; validate each input; perform steps sequentially; enter a user-review checkpoint if requested or confidence is inadequate; preview output; produce print sheets and export. Pause, cancel and retry must be possible with isolated per-item errors.

## Example workflow: 2x2 portrait on A4
1. Import new portrait.
2. Remove background locally; replace with white; allow manual mask cleanup.
3. Suggest face-safe 50.8 x 50.8 mm crop; review before finalizing.
4. Apply conservative tone adjustments.
5. Set item size to 50.8 x 50.8 mm and chosen copy quantity.
6. Compose A4 using saved margins, gaps and cut guides.
7. Review resolution warnings and export multi-page PDF.

## Data contract (proposed)
Workflow: id, schemaVersion, name, description, updatedAt, steps[].
Step: id, operation, enabled, parameters, reviewMode ('never'|'always'|'on-uncertainty').
Representative operations: crop.to-size; image.adjust; image.remove-background; image.replace-background; design.add-text; sheet.configure; sheet.compose; export.pdf; review.manual.

The executor needs per-operation validation, a versioned migration strategy, immutable input references, and an explicit output type. Unsupported operations are not silently skipped.

## Repeat last job
Duplicate the prior workflow configuration, ask for replacement source(s), recalculate image-dependent focal positions or require review, then reuse page size, spacing, quantity and export parameters. Preserve the previous job unchanged.

## Failure cases
- AI model unavailable offline → offer manual masking or pause with actionable error.
- New image cannot fit existing crop → request alignment review rather than stretch silently.
- PDF exceeds memory quota → show estimate; allow fewer pages/items.
- One batch item fails → record failure without losing other successful items.
- Version not supported → require import/migration rather than applying wrong operations.

## Current state
This document specifies expected behavior. Until the workflow engine and recorder land, these examples are not functioning UI controls.
