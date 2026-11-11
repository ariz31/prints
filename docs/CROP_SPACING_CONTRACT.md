# Crop spacing and shape packing

## Physical spacing contract

- The configured gap is measured in millimeters between printable cut contours, never pixels.
- For axis-aligned rectangles and rounded rectangles with parallel sides, exact bounding edges must be separated by the configured gap whenever a placement is available.
- Irregular or interlocking shapes may have overlapping bounding boxes only when their actual cut contours have at least the configured minimum clearance.
- Zero gap permits contour contact but never overlapping printed regions.
- Paper margins, rotation, preview and PDF use the same placement coordinates.
- Ticket and notepad fixed cutting grids retain their existing cutting-cell semantics.

## Algorithm

- Exact size-plus-gap lattice coordinates and neighboring placed-item anchors are checked first.
- Optional bounded contour-contact refinement improves packing for non-rectangular shapes.
- A deterministic coarse candidate grid remains the fallback, with collision checks on the actual contours.
- The first-sheet template is reused for large identical-copy jobs. Mixed batches remain bounded, and the result is a deterministic heuristic, not a proven global optimum.
- Auto and manual packing share `placementGeometry.ts` collision and clearance rules.

## Acceptance

- Exact 3 mm horizontal spacing for aligned 40 mm rounded rectangles; vertical rows obey the same rule.
- Decimal gaps (e.g., 2.5 mm) are not quantized by the fallback grid.
- No overlaps or undersized clearances for any of the 15 crop shapes or mixed-shape sheets.
- Deterministic repeated copies and no missing IDs at 59/60 or 1,000-copy boundaries.
- Validate placement coordinates in screen preview, PDF and cut guides.
