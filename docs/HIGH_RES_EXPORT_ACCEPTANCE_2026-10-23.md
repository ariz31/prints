# High-resolution export acceptance — 23 October 2026

Issue: [#48](https://github.com/ariz31/prints/issues/48)

## Implemented in this branch

- Explicit 300 / 600 DPI export selection, stored in local projects, layouts and workflow settings.
- Tiled, exact-crop, local photo rasterizer. PDF embeds individually positioned image tiles and retains PDF-native vector layers/cut marks.
- PNG export uses streaming deflate scanlines when the design exceeds the former 9 MP / 3000 px Canvas cap, without allocating an A3 full-page Canvas.
- Both standard and streamed PNGs carry an explicit pHYs physical DPI tag.
- Pure tests for A3 raster dimensions, PNG headers and physical DPI, invalid sizes, local pixel-pipeline global coordinate alignment and preflight warnings.
- Preflight distinguishes native source DPI from requested output sampling and rejects unsafe total pixel budgets.

## Explicit limitations

1. 600 DPI A3 is approximately **7016 × 9922 pixels**, roughly 70 MP. Source pixel detail must independently justify that sampling.
2. Extremely large batches are blocked before PDF generation above 120 MP of *distinct* designs. Additional hard per-design limits apply. Browsers can still run out of memory; successful Node tests do **not** certify device-level memory behavior.
3. Crop-local **spot healing** now reserves a bounded global source ring for each high-resolution tile, and a pixel-exact whole-frame/tiled regression covers healing combined with sharpening. Large brush radii exceeding the 3 MP per-tile scratch budget still fail with a clear actionable error; browser rendered-image fixtures and physical print validation remain pending.
4. PDF tiles are retained in the pdf-lib document until save. This is bounded at tile-rasterization time, but **not a constant-memory PDF output pipeline**. Large images still require manual profiling before this issue can be called fully resolved.
5. ZIP batch export still has its existing ~96 MiB archive limit. High-DPI PNG can exceed it; an actionable error is surfaced.
6. Browser previews intentionally run at a smaller resolution; they do not demonstrate that the export has 300/600 DPI worth of source detail.

## Outstanding release acceptance

- [ ] Automated or independent PDF render comparison (tile seams, alpha, rotations, photo adjustments, layers, crop positioning).
- [ ] PNG decoder/golden-pixel checks at A3 300 and 600 DPI, including transparency and retouch boundaries.
- [ ] Repeated 600 DPI A3 exports on representative Android/iOS/desktop devices without failure.
- [ ] Physically measure ID-photo and A3 outputs on actual printers, at Actual Size / 100%.
- [ ] Confirm the exact-head Vercel preview passes tests, strict TypeScript, production bundle and PWA checks.

**Do not close issue #48 solely because its Vercel build is green.**
