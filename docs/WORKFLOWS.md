# Workflow Studio — runtime and roadmap

## Current working subset
Workflows are versioned sequences of supported semantic operations. Users can:
- Capture current paper settings and first image's print size/quantity.
- Manually add, reorder, edit, enable, disable, save, reopen or delete steps.
- Start and stop recording supported UI changes (sheet settings, image sizing, quantities, framing changes).
- Apply saved settings to all sources or only a selected photo.
- Add a manual-review step. The current runner asks for confirmation and displays notes before treating the output as ready.

Supported runnable steps:
- sheet.configure — physical paper, margins, gap, orientation and trim outlines.
- crop.to-size — requested print size, not a photographic selection.
- copies.set — copies per photo.
- crop.center — framing percent, with review note.
- review.manual — explicit review notice.
- sheet.compose — recomputes the live layout from current parameters.

On new source images, a precise crop selection from an older photograph is **not** blindly replayed. Photo-specific manual crops create review notes instead.

## Important restrictions
The current runner explicitly rejects image.remove-background, image.replace-background, image.adjust, design.add-text and export.pdf steps. The model is present for architectural planning only. Current review is a confirmation before applying, not a resumable checkpoint between processing steps.

The workflow definition is distinct from a full project (which stores original image bytes) and a reusable visual template (not yet implemented). Workflows are stored locally in browser localStorage.

## Next implementation goals
- Real in-progress pause/review/resume and per-item retries for large batches.
- Safe recorder integration with advanced layer editor.
- On-device AI model downloads, automatic segmentation, mask restoration and edge cleanup.
- Batch jobs with isolated errors, progress and cancellation.
- Versioned workflow backup/import plus migrations.

## Safeguards
Record semantic operations, never screen-coordinate mouse gestures. Validate before executing. Preserve source images and physical print sizes. Reject unknown operations rather than quietly pretending to have performed them.
