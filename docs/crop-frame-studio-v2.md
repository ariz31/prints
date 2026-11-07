# PRINTS — Crop & Frame Studio v2.0: integration contract

Status: **foundation only; not production ready**. This branch must not be
merged until the remaining UI, compositor, persistence and export gates are
implemented and verified.

## User-visible contract

- Exactly **one** non-destructive crop per image.
- Existing 15 crop contours, existing frame-art assets, multiple photo assets,
  copy quantities, paper settings and every existing print mode must survive.
- No multi-region editor, AI cropping, automatic subject recognition, server
  processing or paid processing dependency.
- Existing V1 projects, JSON backups and ZIP backups must remain readable;
  neither original image bytes nor frame preset IDs are rewritten.

## Current main-branch audit (2026-11-07)

| Area | Existing implementation | v2 dependency |
| --- | --- | --- |
| Crop | `src/features/crop/components/CropEditor.tsx`: stationary physical frame, source pan/zoom, keyboard moves | Add one resize overlay with eight handles and numeric units; keep existing gesture and history semantics |
| Crop math | `src/features/crop/logic/crop.ts`: normalized source crop; `exactCropSourceRect` rejects differing aspect ratios | Keep one authoritative source-space crop and recompute physical output together with any unlocked aspect change |
| Shapes | `cropShapes.ts`: 15 preset polygons; the same preset IDs used for CSS/raster/mask/sheet packing | Support validated custom vertices/curves and one shared contour resolver |
| Frames | `src/features/layers/logic/layers.ts`: frame layer is required to fill the print item | Relax with a versioned frame geometry and preserve compatibility for legacy full-design layers |
| Raster | `src/platform/rendering/imageRaster.ts` and `highResRaster.ts`: distinct ordinary/tiled code paths | Extract shared transform/crop/mask geometry to avoid print discrepancies |
| Export | `exportPdf.ts` and `exportPng.ts`: mm placement and raster output | Match v2 geometry, alpha, Fit/Fill and cutouts in both output paths |
| Storage | `projectStore.ts`, `projectArchive.ts`, `projectZipArchive.ts` | Validate optional v2 metadata and round-trip it through project save/reopen/JSON/ZIP |
| Performance | Worker preview in `useCropRaster.ts`, separate high-resolution tiles | Reuse previews during drag, invalidate obsolete requests, ensure one final-resolution pass |

## Source-of-truth model

`studioDocument.ts` introduces a **separate, opt-in v2 model** containing
one crop, independent image and crop transforms, one contour, frame geometry,
physical output sizes and DPI. It is deliberately *not* wired into asset
persistence or rendering in this foundation commit; doing so before both
export pathways understand it would create a silent print-data loss bug.

The legacy migration copies the source crop, preset and physical output
measurements. It **does not** copy current `PhotoAdjustments` transforms or
frame layers into the new transform fields, because the legacy renderer already
applies them. A subsequent integration must migrate these atomically and
prove that every transform is applied exactly once.

Geometrical ratios must distinguish physical output ratio
(`output.widthMm / output.heightMm`) from **source-normalized ratio**
(`physicalRatio * sourceHeightPx / sourceWidthPx`). Pass the latter to
`resizeCropRegion`, and keep output dimensions synchronized before
accepting the edit. The legacy rectangular export guard must remain active
until this conversion is fully integrated.

## Required transformation contract

The visual pipeline must be identical in low-cost interactive preview,
standard PNG, tiled PNG and PDF embed:

1. Decode and cache original image bytes; never re-encode them on pointermove.
2. Resolve the legacy adjustment/v2 image transform once.
3. Apply manual four-corner perspective/skew and image rotate/flip in a
   deterministic documented order with an inverse sampling transform.
4. Position/scale a **single** crop contour; use one shared clipping path.
5. Fit or Fill image within a frame without geometric stretching.
6. Composite background/border/shadow and existing vector frame primitives.
7. Position the finished design on paper in millimeters; perform print-mode
   cutting guides, numbering and optimizations after the design raster is ready.

Any stage used in tiled export must use **global output-space coordinates**,
not per-tile local coordinates, so cropped edges, Bézier paths, shadows and
perspective seams are continuous between tiles.

## Remaining implementation milestones

### A. Model and migration
- Wire the optional v2 document into `PhotoAsset`, validators, IndexedDB,
  JSON and ZIP; preserve legacy asset fields.
- Create test fixtures for V1 save/reopen and migration with text/frame layers.
- Unify legacy photo-adjustment transforms and new image transforms so they
  cannot be applied twice; round-trip all per-image parameters.

### B. Interactive editor
- Provide draggable and keyboard-operated eight resize handles, snapping
  bypass, mm/cm/in/px inputs, and physical-aspect locking.
- Add independent image/crop rotation and flip, manual four-corner perspective,
  polygon vertices, Bézier controls and one active contour.
- Preserve crop-scene zoom/pan and prevent touch scroll interference.
- Add compact Crop / Transform / Shapes / Frame / Precision / Presets panels
  using the current UI component conventions; no duplicate editor.

### C. Frame and template integration
- Keep curated decorative vector preset IDs and add independent frame bounds,
  Fit/Fill, border, corner-radius, background and shadow parameters.
- Persist named, duplicateable, renamable and deletable crop/frame/combined
  templates locally, storing metadata rather than duplicate image payloads.

### D. Preview, compositor and export
- Implement the same contour and transform pipeline in the normal raster
  renderer, worker preview and tiled high-resolution renderer.
- Support alpha in PNG and existing PDF pathways; preserve frame/text layers
  where compatible with the chosen clipping model.
- Update shape-aware nesting to accept validated custom geometry and maintain
  bounded search for large batches. Do not claim a globally optimal layout.
- Preserve multiple images, quantities, existing print modes and copying;
  ensure no additional raster work per copy.

### E. Release gate (do not merge early)
- Run and pass Node unit/integration suite (`npm test`), TypeScript
  (`npm run typecheck`) and the existing production build (`npm run build`).
- No new browser end-to-end test requirement.
- Verify precision: expected print geometry within **0.25 mm**, including
  72–1200 DPI export and arbitrary paper orientation.
- Test thin concave/degenerate polygons, noninvertible perspective, clipping,
  Fit/Fill, transparent frame shadow, reset/undo/redo and source-file recovery.
- Check ordinary and tiled PNG/PDF output agree at tile seams and on physical
  dimensions, including ID, stickers, circular designs and shaped sheet packing.
- Profile mobile drag latency, initial crop interaction, repeated edits and
  workloads above 60 copies; no unbounded canvas/bitmap/URL retention.
- Revalidate exact PR HEAD against current `main` before merging.

**No user-facing v2 control should be enabled while it can only affect preview
but not authoritative print/export output.**
