# PRINTS post-redesign audit — 29 October 2026

Baseline: `main` at `99615966d381b8550b03a73a5d626327d360ce23`, PR #90. This review covers preview source lifetime, editor pointer release, high-resolution PNG packaging, responsive recovery, and the existing browser/Node regression suite.

## Confirmed defects addressed

1. **Crop and Smart ID stale raster display:** `useCropRaster` previously returned the last blob URL even after the source/crop/size key changed, or after a decode failure. With an unchanged URL on-screen, a user could see old pixels while the controls represented a new frame. Only exact-key valid rasters are now exposed; full-source/crop views can show loading or fallback before the new exact preview arrives. The original source and physical crop data remain untouched.
2. **Smart ID compare mode conflated failures:** The original-image comparison used the same `onError` callback as the computed raster. An unavailable original could poison the computed crop's error state. The comparison now reports its own failure, exits comparison, and does not disable a valid crop. Gesture capture is enabled only for a currently decoded raster.
3. **Layer drag release vs. preview:** `LayerCanvas` previously read a React render's `draft` value on pointer up; the last pointer move could still be queued. This could commit unsnapped geometry even when the pointer visually showed a snapped item. A synchronous ref now tracks the exact preview transformation to commit. Pointer cancel, lost capture, Escape, and new editor values clear it.
4. **PNG DPI retagging memory overhead:** `tagPngDensity` previously materialized the entire encoded PNG as a new ArrayBuffer and copied every chunk, multiplying peak usage on high-resolution jobs. It now validates chunk headers in bounded reads and reuses compressed Blob slices, replacing the single `pHYs` field and rejecting trailing data after `IEND`.

## Regression coverage and release gates

- Added pure tests for exact-key raster selection, current-source failures, and disabled editor state.
- Added density/format tests preventing whole-PNG JavaScript buffer reads and rejecting malformed terminal chunks; existing physical DPI tests remain in place.
- Existing Vercel build runs Node unit/integration, strict app and e2e TypeScript, Vite, brand and offline/PWA smoke, plus 35 Chromium scenarios spanning 390×844, 844×390, 768×1024, 1440×900, and 320×568. Never count a pending or failed test as passing.
- Run on the PR's **exact final commit**; inspect full build output, not merely Vercel deployment readiness. After merging, verify the new `main` deployment on its merge SHA.

## Remaining acceptance limits

This corrective PR does not certify real Android/iOS touch, memory stress at A3/600 DPI, background AI model provenance, storage eviction, complex-script shaping, or physical print/calibration. The existing feature/acceptance issues #32, #48, #49, #51, #52 and #53 remain scoped to those outstanding requirements. Issue #78's reproducibility implementation was previously delivered by PR #90, but no administrative issue closure is claimed here.

No GitHub Actions, paid APIs, remote photo processing, or new runtime packages are introduced. Existing projects, archives, source photos and millimeter-defined export geometry remain compatible.
