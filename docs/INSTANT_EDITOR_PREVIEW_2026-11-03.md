# Instant client-side editing feedback (2026-11-03)

## Symptoms and root causes
- Smart ID originally displayed only its newly rasterized crop; changing Zoom invalidated the prior preview key and exposed the checkerboard until a delayed 140 ms raster task, canvas encoding, and image decoding completed. It also blocked further framing until the exact preview loaded.
- Crop & Frame already kept a CSS crop as fallback, but its exact raster was generated on the main UI thread.
- Advanced Photo Studio reused the last successful processed image while new parameters rendered. Tonal changes could therefore look frozen when a pixel operation (sharpness, denoise, retouch, etc.) was also active.
- Background Editor uploaded the complete editing canvas on every brush event, even when only a small area changed.

## Implementation
- Both Smart ID and Crop & Frame now frame the decoded local source immediately using the same crop geometry. A latest-only OffscreenCanvas worker produces the **exact** computed raster after 90 ms idle; unsupported devices fall back to the existing local Canvas renderer.
- Smart ID allows framing when the actual source has decoded, even while a new raster is pending. Original comparison, analysis, and source loading continue to block framing.
- Exact pixel comparison is never used as a shortcut for applying changes: **Create IDs** and **Apply crop** still require the exact current raster to have finished and decoded successfully.
- The Photo Editor overlays immediate relative brightness/contrast/saturation adjustments on the last good advanced raster while the worker catches up. Worker-generated blob URLs are decoded before being swapped into the UI. Final Apply remains gated on a decoded final-quality exact result.
- Background brush strokes use dirty-rectangle putImageData instead of a full-canvas repaint. Full-mask operations still repaint the whole canvas as required.

## Correctness and safety boundaries
- Existing crop geometry, physical dimensions, print layout, export DPI, alpha/pixel processing, undo/redo coalescing and error states remain unchanged.
- Preview acceleration is client-only and does not add Vercel Functions, database writes, external image uploads, or browser E2E execution.
- The interim CSS image is feedback, **not** the print/export source of truth. Compare Original remains read-only.
- Local unit tests cover CSS framing, last-raster tonal deltas, dirty brush bounds and worker latest-only queue semantics. The non-E2E SSR smoke verifies wiring and exact commit gates.
- Performance targets are a visible response on the next rendered frame for CSS-based changes and smooth movement on supported devices, not an unverified universal 60 FPS guarantee. Real Android profiling remains required for device-specific frame timing.

## Verification
Run `npm run build` on the exact PR head (Node unit/integration, TypeScript, Vite, SSR UI smoke and offline checks). The repository intentionally does not execute E2E in the build pipeline. Verify the exact-head Vercel Preview result before merging.
