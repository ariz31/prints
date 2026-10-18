# Quality and test policy

## Core invariants
1. For every placement: x >= margin, y >= margin, x + width <= paper width - margin, y + height <= paper height - margin.
2. No unintended overlap of placements in the same sheet.
3. Quantity is preserved across pagination; no dropped or duplicated items.
4. Paper sizes and printed objects retain exact mm-to-point conversion at export.
5. Crops retain original source image bytes; repeated images share source asset references.
6. Offline operations never require remote photo uploads.
7. Workflow replays are deterministic for identical inputs and parameters, or surface explicit review requirements.

## Tests by layer
- Geometry: zero/invalid/oversized values, margins, gap boundaries, page rollover, multiple item sizes.
- Preview: placement and sizes match core geometry under portrait/landscape.
- Export: PDF page width/height in points, image placements and clipping, failure handling for corrupt files.
- Workflow: step validation, version compatibility, review checkpoints, source replacement, batch cancellation.
- Editor: reversible ops, normalized crop behavior, mask save/restore, layering and text positioning.
- Offline: warm-cache start, local save/reopen and offline PDF, appropriate error when AI model uncached.
- Security: invalid MIME, oversized files, malformed saved JSON, quota errors.

## Definition of done
- Tests with reproducible commands; no failing typecheck or build.
- No claims of features not present or tested.
- Clear error messages and keyboard-operable critical controls.
- Document actual limitations and regressions in PR body.
- Do not merge solely on an arbitrary quality score or green GitHub status; inspect behavior and edge cases.
