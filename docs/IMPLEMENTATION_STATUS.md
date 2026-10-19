# Implementation status

## Delivered across foundation and this milestone
- Browser-based React and TypeScript application with production bundling.
- Standard one-click print-size presets (1×1, 2×2, ID-1/CR80, business cards, 4×6, A6) and downloadable physical-size printer calibration sheets.
- Local JPEG/PNG/WebP import, physical print sizing, quantities, mixed rectangular placement, pagination, visual preview, low-DPI warnings, client-side PDF output.
- Smartphone-style fixed-frame crop with drag, wheel/pinch zoom, keyboard access and visible aspect locking; the exact normalized visible rectangle is shared by the preview and PDF (no hidden second cover crop).
- Unit-aware measurement inputs and locally saved default print preferences (paper/orientation/margins/gaps/cut lines); responsive mobile Preview/Images/Print layout and streamlined sidebar.
- Vector brand assets, accessible contextual help and design-token-driven visual system.
- Local solid-color border background cleanup with sampled color, configurable tolerance, manual erase/restore brushes, and transparent edited PNG; source photos preserved in projects. This is not AI subject detection or complex edge matting.
- Per-design text/rectangle/ellipse layers: add, rename, color, reorder, hide, duplicate, remove, and numerically position. Repeat copies share the layers; PDF exports use vector text/shapes. Original assets and layers are persisted in projects.
- Saved full projects in IndexedDB, including original Blob assets and print settings; list, reopen and delete.
- Portable JSON backup export/import with embedded original and processed images, layers and physical layout; validation, size cap and new project IDs on import.
- Saved local layout presets.
- Saved semantic workflow definitions with manual step creation/editing/reordering, step enable/disable, on-session recording of supported sheet/sizing/quantity/framing actions, and replay for one or all images. A review prompt is shown when workflow review notes exist.
- Versioned project and workflow types, pure geometry and operation tests; Vercel builds run all unit tests, TypeScript, bundling and output checks.

## Deliberate limitations
- Workflow runner supports sheet.configure, crop.to-size, crop.center, copies.set, sheet.compose and review.manual. Unsupported image/AI/design/export steps **fail explicitly**. Workflow review currently happens before applying changes; there is no per-step pause/resume checkpoint engine.
- Crop uses one movable fixed-aspect window per source image; multiple independent crops per source and advanced mask selections are not implemented.
- This is a foundational numeric-input layer editor; direct canvas dragging, rich font embedding, grouping, robust typography, general-purpose design features and undo/redo history are not yet implemented.
- AI background segmentation, complex hair-edge matting, face analysis, AI enhancement, large batch engine, optimized rectangle/shape nesting, duplex registration and PDF calibration are not yet implemented.
- Saved workflow definitions use localStorage; full project assets use IndexedDB. Portable project JSON backups are available up to 48 MiB source images; streaming ZIP and separate workflow-library backups are not yet implemented.
- Preview and PDF share crop rasterization; an exported calibration PDF helps the user check real paper output, but manual measurement and printer-driver adjustment are still necessary.
- Vercel Vite deployment config and revisioned asset precache generator are included; offline behavior still needs production browser-host testing. No AI model assets are packaged.
- Image preview rasterization is resource-limited and may degrade on low-memory devices.

## Next milestone
1. Validate saved projects across browsers with quota, crash-recovery and version-migration tests; improve backup formats.
2. Implement true layered text/shape/photo design objects and undo/redo.
3. Add structured manual review checkpoints and robust batch execution progress/error handling.
4. Evaluate/licence offline model assets and integrate segmentation and mask edge editing.
5. Enhance sheet packing, cut marks/bleed and printer calibration.

## New editing milestones

- Direct manipulation of editable text/rectangle/ellipse overlays: drag on the actual cropped photo, resize via corner grip, and nudge with arrow keys. Numeric inputs remain available for precision. Original design geometry is stored relative to the physical print product.
- Undo/redo up to 50 steps for print settings, crop, size, quantity, layers, and workflow/preset application. Source-image imports, removals and replacement background PNGs intentionally reset editor history; they are not undoable, because old temporary image object URLs may have been revoked.
- Workflow replay now recalculates exact crop shape when the requested output size changes. No hidden secondary crop is applied.
- Verification remains Vercel-only, with no GitHub Actions.

## Additional print-production milestone
- Multiple named local layout presets (up to 40), including migration of the legacy one-preset key when available. Names, physical paper settings, quantities and image dimensions can be recalled for new jobs.
- Optional compact shelf arrangement sorts mixed print items by height and uses the result only if it does not increase sheet count. Source order remains available and preserved for users who need it.
- The selected arrangement persists with complete projects and is supported during workflow replay.
- This is deterministic rectangular shelf packing, not unrestricted geometric nesting or arbitrary rotations.

## Nondestructive photo adjustments
- Brightness, contrast and saturation per image with quick reset, kept as metadata (original and manually edited PNG bytes remain untouched).
- The crop preview and PDF share canvas image filter parameters. The stationary-frame crop editor shows the same filter.
- Adjustment metadata is included in saved projects and portable backups, validated on import, and available as a repeatable workflow step for one or all images.
- This is browser-level tonal adjustment, not color-managed ICC proofing or AI retouching; physical print fidelity needs printer tests.

## Portable workflow libraries
- Local workflow definitions can be exported to a versioned JSON archive and imported on another device. Imports enforce operation validation, a 1 MiB limit and 100-recipe cap; fresh IDs avoid overwriting saved recipes.
- Workflow portability is separate from full projects: recipes do not embed customer images, and they intentionally do not silently replay a photo-specific selection.

## Individual finished-design PNG exports
- Download one cropped and adjusted print design as transparent PNG at 300 DPI (capped by the existing raster memory limits).
- Text, rectangle and ellipse layers are composited at their physical positions; output is not restricted to the photo alone.
- PDF remains preferred for multipage imposition, cut guides and page geometry.
- Colors/fonts are not ICC-profile-managed; physical color proofing remains a device-level release criterion.

## Multiple print products from one photo
- Duplicate any design without reimporting image bytes. Every duplicate has its own ID, crop, print size, copy quantity, adjustments and independent layer IDs.
- Shared original/processed browser image URLs are reference-counted on removal and mask replacement, preventing one design's deletion from breaking another design's preview/PDF.
- Complete project saving retains both items and their independent design settings. This workflow supports producing 1×1 and 2×2 photos from the same imported source.
