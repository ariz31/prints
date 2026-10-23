# Advanced Photo Studio — Issue #32 acceptance ledger
Date: 2026-10-23 · Repository: ariz31/prints

## Scope and supported processing

This document tracks the P0 definition of done in issue #32. Existing implementation was delivered in #34–#36 and subsequent reliability fixes; the final P0 follow-up adds:

- Optional `schemaVersion: 1` to validated `PhotoAdjustments`. Legacy unversioned three-field edits remain accepted unchanged by IndexedDB, archive v1/v2 and workflow imports. Newly applied edited styles carry version 1.
- Adjustable local Auto Enhance intensity (0–100%, neutral at 0%) and explicit Reset; its analysis is deterministic, bounded, and invalidated if the user changes the draft before analysis finishes.
- User-defined global Photo Studio styles, stored locally with a strict 12-style cap, validated names, version and adjustments. A style never stores customer images, crop coordinates, local retouches, backgrounds or geometric transforms.
- Applying a batch style preserves each image's crop, existing retouch regions, background replacement and orientation. Built-in styles also leave individual source-specific adjustments untouched.
- A reusable set of pure helper tests for legacy compatibility, normalized values, intensity bounds, scene isolation, valid/invalid persisted styles, plus archive migration tests and SSR discoverability smoke checks.

## Existing P0 capabilities confirmed in code

- Nondestructive Light / Color / Detail settings, neutral defaults, brightness/contrast/saturation legacy Canvas filter, incremental pixel-processing pass for exposure, highlights/shadows, white/black levels, temperature/tint/vibrance, denoise/sharpen.
- Explicit print-crop / full-image preview modes, zoom/pan and Compare original, presets, per-control reset, Apply/Back, local progressive editing categories, rotation/flip/straighten and exact physical product size.
- Shared `rasterizePhoto` from `src/core/imageRaster.ts` for final-crop preview and 300-DPI-target PNG/PDF/ZIP output. Cropping and geometry precede the Canvas brightness/contrast/saturation filter and advanced pixel corrections; layers are added afterward in output. Photo-specific retouch placement uses print-crop coordinates. The full-image preview deliberately excludes crop-local retouch regions.
- Reversible history, project storage and archive backups; validation against NaN, out-of-bounds values, invalid source dimensions, and oversized rasters. The original preview raster is still bounded at 3000 pixels / 9 megapixels; the later high-resolution export path instead uses bounded image tiles and streamed PNG output for 300/600 DPI. High-resolution spot healing now uses a bounded source-ring halo, with oversize brushes rejected explicitly.
- No account, mandatory cloud processing, forced model download, fabricated ICC color profile or false AI-upscaling claims.

## Validation supplied by automation

Vercel `npm run build` gates strict TypeScript, unit and integration tests, bundling, SSR UI checks and PWA/offline integrity. Current additions test legacy vs v1 edit metadata, Auto Enhance strength 0/50/100 and errors, local-style validation, preservation of source-specific transformations in batch, and versioned archive roundtrip.

**Limitations:** SSR and Node tests are not a substitute for DOM touch/gesture testing, actual photo color judgment, or a printed sheet. Raster preview is bounded in resolution, whereas output may use a larger raster; close inspection and measured printing still matter.

## Outstanding mandatory manual acceptance — NOT certified

Issue #32 must **remain open** until an operator records results for:

- Android Chrome: touchscreen sliders, 100–250% zoom/pan, Back without Apply, Apply, preset selection, orientation and crop-local retouch; reopen a saved project and inspect before/after.
- iOS Safari where supported: touch gestures, slider updates and accurate new/legacy backups.
- Desktop: mouse/keyboard focus, controls, apply/cancel, undo/redo, backup roundtrip and reasonable memory use.
- Physical sample prints: measure a 1x1/2x2 ID photo and a larger photo against a ruler on the actual printer, at 100% driver scaling; verify the crop and note monitor-to-paper color differences (printer, ink, media and driver settings).
- Format matrix on real browsers/devices: representative JPEG, PNG with alpha, WebP, rotated non-square crop, plus PNG, PDF and ZIP output; perform pixel-tolerance sampling where possible and check memory limits on a mid-range mobile device.
- Offline app-shell install and reopening, storage quota behavior, and refresh/update of local saved styles.

P1/P2 in issue #32 are separate optional future increments; semantic AI, physical ICC certification and super-resolution remain gated feasibility items, not implied by this feature branch. Do not mark this issue `completed` based solely on passing Vercel tests.
